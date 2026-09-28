/** 한 브라우저 세션의 재사용·교체·회수를 직렬화합니다. */
import type { Browser, BrowserContext, Page } from 'playwright';
import { createBrowserRunner } from './browser.js';
import type { BrowserRunner } from './oliveyoung.js';
export interface BrowserOwner {
  browser: Pick<Browser, 'newContext'>;
  pid: number;
  close(): Promise<void>;
  rss(): Promise<number>;
}
export async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser watchdog timeout')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export function createBrowserLifecycle(launch: () => Promise<BrowserOwner>) {
  let owner: BrowserOwner | undefined;
  let page: Page | undefined;
  let context: BrowserContext | undefined;
  let active = false;
  let closed = false;
  let failed: unknown;
  let cleanup: Promise<void> = Promise.resolve();
  let born = 0;
  let calls = 0;
  let totalCalls = 0;
  let rotations = 0;
  let rssBytes = 0;
  let reason = 'startup';
  let timer: ReturnType<typeof setInterval> | undefined;
  let initializing: Promise<void> | undefined;
  let replacementPending = false;
  const retire = (why: string) => {
    reason = why;
    if (timer) clearInterval(timer);
    timer = undefined;
    const previous = owner;
    if (!previous) return cleanup;
    owner = undefined;
    page?.removeAllListeners('crash');
    page?.removeAllListeners('close');
    context?.removeAllListeners('page');
    page = undefined;
    context = undefined;
    cleanup = bounded(previous.close(), 10000).catch((error) => {
      failed = error;
      throw error;
    });
    // 이벤트 핸들러에서 발생한 실패도 보존하고 다음 요청/종료에 전달합니다.
    void cleanup.catch(() => undefined);
    return cleanup;
  };
  const retireQuietly = (why: string) => {
    void retire(why).catch(() => undefined);
  };
  const ensureSession = async () => {
    await cleanup;
    if (closed) throw new Error('Browser lifecycle unavailable');
    if (owner && Date.now() - born >= 30 * 60 * 1000) {
      await retire('rotation');
      rotations++;
    }
    if (owner) return;
    owner = await launch();
    born = Date.now();
    calls = 0;
    if (closed) {
      await retire('shutdown');
      throw new Error('Browser lifecycle unavailable');
    }
    try {
      context = await bounded(owner.browser.newContext({ locale: 'ko-KR' }), 10000);
      // 초기 페이지를 먼저 지정하여 이후 추가 페이지는 모두 닫습니다.
      page = await bounded(context.newPage(), 10000);
      const sessionOwner = owner;
      context.on('page', (popup) => {
        void bounded(popup.close(), 3000).catch(() => {
          if (owner === sessionOwner) retireQuietly('popup-close-failed');
        });
      });
      page.on('crash', () => retireQuietly('page-crash'));
      page.on('close', () => retireQuietly('page-closed'));
      await bounded(
        page.goto('https://www.oliveyoung.co.kr/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        }),
        32000,
      );
      await bounded(page.waitForURL('**/store/**', { timeout: 30000 }), 32000);
      if (closed || owner !== sessionOwner) throw new Error('Browser lifecycle unavailable');
      timer = setInterval(() => {
        if (!active && Date.now() - born >= 30 * 60 * 1000) {
          rotations++;
          rotate('age-limit');
          return;
        }
        void bounded(sessionOwner.rss(), 5000)
          .then((value) => {
            if (owner !== sessionOwner) return;
            rssBytes = value;
            if (value > 2 ** 30) rotate('rss-limit');
          })
          .catch(() => {
            if (owner === sessionOwner) retireQuietly('rss-failed');
          });
      }, 30000);
    } catch (error) {
      await retire('startup-failed');
      throw error;
    }
  };
  const ensure = () => {
    initializing ??= ensureSession().finally(() => {
      initializing = undefined;
    });
    return initializing;
  };
  // 교체당 한 번만 미리 준비하고 실패 시 다음 명시적 요청을 기다립니다.
  const prepareReplacement = () => {
    replacementPending = false;
    void ensure().catch(() => undefined);
  };
  const rotate = (why: string) => {
    replacementPending = true;
    retireQuietly(why);
    if (!active) prepareReplacement();
  };
  const run: BrowserRunner = async (path, body) => {
    if (active) throw new Error('Browser already active');
    active = true;
    try {
      await ensure();
      const result = await bounded(createBrowserRunner(page!)(path, body), 18000);
      calls++;
      totalCalls++;
      if (calls >= 200 || Date.now() - born >= 30 * 60 * 1000) {
        rotations++;
        replacementPending = true;
        await retire('rotation');
      }
      return result;
    } catch (error) {
      await retire('request-failed');
      throw error;
    } finally {
      active = false;
      if (replacementPending) prepareReplacement();
    }
  };
  return {
    run,
    start: ensure,
    async close() {
      closed = true;
      await initializing?.catch(() => undefined);
      await retire('shutdown');
      await cleanup;
    },
    status: () => ({
      state: failed ? 'failed' : closed ? 'closed' : initializing ? 'starting' : owner ? 'ready' : 'idle',
      active,
      calls,
      totalCalls,
      rotations,
      rssBytes,
      pages: context?.pages().length || 0,
      reason,
    }),
  };
}
