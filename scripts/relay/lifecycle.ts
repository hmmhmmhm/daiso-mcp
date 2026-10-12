/** 두 소유 슬롯 안에서 준비·교환·회수를 제한합니다. */
import type { Browser, BrowserContext, Page } from 'playwright';
import { createBrowserRunner } from './browser.js';
import type { BrowserRunner } from './oliveyoung.js';
export interface BrowserOwner {
  browser: Pick<Browser, 'newContext'>;
  pid: number;
  close(deadline?: number): Promise<void>;
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
interface Session {
  owner: BrowserOwner;
  born: number;
  calls: number;
  page?: Page;
  context?: BrowserContext;
  ready: boolean;
  attempted: boolean;
  retired: boolean;
  closing?: Promise<void>;
}
const MAX_AGE = 30 * 60 * 1000;
const PREPARE_AGE = 27 * 60 * 1000;
const MAX_RSS = 2 ** 30;
export function createBrowserLifecycle(
  launch: () => Promise<BrowserOwner>,
  onEvent?: (reason: string) => void | Promise<void>,
) {
  const emit = (why: string) => {
    try {
      void Promise.resolve(onEvent?.(why)).catch(() => undefined);
    } catch {
      /* 관측 실패는 회수를 방해하지 않습니다. */
    }
  };
  const sessions = new Set<Session>();
  let current: Session | undefined;
  let candidate: Session | undefined;
  let preparing: Promise<void> | undefined;
  let maintenance: Promise<void> | undefined;
  let active = false;
  let executing = false;
  let closed = false;
  let failed: unknown;
  let totalCalls = 0;
  let rotations = 0;
  let rssBytes = 0;
  let reason = 'startup';
  let shutdownDeadline = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const check = () => {
    if (failed) throw failed;
    if (closed) throw new Error('Browser lifecycle unavailable');
  };
  const retire = (session: Session, why: string, deadline = Date.now() + 10000) => {
    if (session.closing) return session.closing;
    deadline = shutdownDeadline || deadline;
    session.retired = true;
    session.ready = false;
    if (current === session) current = undefined;
    if (candidate === session) candidate = undefined;
    session.page?.removeAllListeners('crash');
    session.page?.removeAllListeners('close');
    session.context?.removeAllListeners('page');
    reason = why;
    emit(why);
    session.closing = bounded(session.owner.close(deadline), Math.max(0, deadline - Date.now()))
      .then(() => {
        sessions.delete(session);
      })
      .catch((error) => {
        failed = error;
        throw error;
      });
    void session.closing.catch(() => undefined);
    return session.closing;
  };
  const quietly = (session: Session, why: string) => {
    void retire(session, why).catch(() => undefined);
  };
  const promote = () => {
    if (executing || closed || failed || !candidate?.ready) return;
    const next = candidate;
    if (Date.now() - next.born >= MAX_AGE) {
      quietly(next, 'age-limit');
      return;
    }
    const previous = current;
    candidate = undefined;
    current = next;
    emit('ready');
    if (previous) {
      rotations++;
      quietly(previous, 'rotation');
    }
  };
  const sample = async () => {
    const owned = [...sessions];
    const values = await Promise.all(
      owned.map(async (s) => {
        try {
          return await bounded(s.owner.rss(), 5000);
        } catch {
          if (!s.retired) await retire(s, 'rss-failed');
          return 0;
        }
      }),
    );
    const live = owned.filter((s) => sessions.has(s));
    rssBytes = owned.reduce((sum, s, i) => sum + (sessions.has(s) ? values[i] : 0), 0);
    if (rssBytes > MAX_RSS) {
      const preparingSession = live.find((s) => s !== current);
      if (preparingSession) await retire(preparingSession, 'rss-limit');
      const index = owned.findIndex((s) => s === current);
      if (index >= 0 && values[index] > MAX_RSS) await retire(current!, 'rss-limit');
    }
  };
  const prepare = () => {
    if (preparing) return preparing;
    if (closed || failed || candidate || sessions.size >= 2) return Promise.resolve();
    const previous = current;
    if (previous) previous.attempted = true;
    preparing = (async () => {
      let session: Session | undefined;
      let phase: 'ownership' | 'context' | 'page' | 'navigation' | 'store-wait' | 'readiness' =
        'ownership';
      try {
        await Promise.all([...sessions].filter((s) => s.retired).map((s) => s.closing));
        await sample();
        check();
        if (current && rssBytes > MAX_RSS / 2) {
          emit('prewarm-skipped-rss');
          return;
        }
        const born = Date.now();
        let owner: BrowserOwner;
        try {
          owner = await launch();
        } catch (error) {
          failed = error;
          emit('launch-failed');
          throw error;
        }
        session = { owner, born, calls: 0, ready: false, attempted: false, retired: false };
        sessions.add(session);
        candidate = session;
        check();
        await sample();
        if (session.retired) throw new Error('Browser lifecycle unavailable');
        phase = 'context';
        emit('prepare-context');
        session.context = await bounded(owner.browser.newContext({ locale: 'ko-KR' }), 10000);
        if (session.retired) throw new Error('Browser lifecycle unavailable');
        phase = 'page';
        emit('prepare-page');
        session.page = await bounded(session.context.newPage(), 10000);
        if (session.retired) throw new Error('Browser lifecycle unavailable');
        const owned = session;
        const invalidate = (why: string) => {
          if (owned.retired) return;
          quietly(owned, why);
          if (!active && !preparing) void prepare().catch(() => undefined);
        };
        session.context.on('page', (popup) => {
          void bounded(popup.close(), 3000).catch(() => invalidate('popup-close-failed'));
        });
        session.page.on('crash', () => invalidate('page-crash'));
        session.page.on('close', () => invalidate('page-closed'));
        phase = 'navigation';
        emit('prepare-navigation');
        await bounded(
          session.page.goto('https://www.oliveyoung.co.kr/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          }),
          32000,
        );
        if (session.retired) throw new Error('Browser lifecycle unavailable');
        phase = 'store-wait';
        emit('prepare-store-wait');
        await bounded(session.page.waitForURL('**/store/**', { timeout: 30000 }), 32000);
        phase = 'readiness';
        await sample();
        check();
        if (session.retired) throw new Error('Browser lifecycle unavailable');
        session.ready = true;
        promote();
        timer ??= setInterval(() => {
          maintenance ??= (async () => {
            await sample();
            if (closed || failed) return;
            if (current && Date.now() - current.born >= MAX_AGE && !executing)
              await retire(current, 'age-limit');
            promote();
            if (current && !current.attempted && Date.now() - current.born >= PREPARE_AGE)
              await prepare();
          })()
            .catch(() => undefined)
            .finally(() => {
              maintenance = undefined;
            });
        }, 30000);
      } catch (error) {
        if (session && !closed) {
          const timeout =
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.message === 'Browser watchdog timeout');
          emit(`startup-${phase}-${timeout ? 'timeout' : 'error'}`);
        }
        if (session) await retire(session, closed ? 'shutdown' : 'startup-failed');
        throw error;
      }
    })().finally(() => {
      preparing = undefined;
    });
    void preparing.catch(() => undefined);
    return preparing;
  };
  const ensure = async () => {
    check();
    if (current && (current.calls >= 200 || Date.now() - current.born >= MAX_AGE))
      await retire(current, 'age-limit');
    promote();
    if (!current) {
      // 실패한 교체를 무한 반복하지 않고 명시적 요청에서만 재시도합니다.
      await Promise.all([...sessions].filter((s) => s.retired).map((s) => s.closing));
      await prepare();
      promote();
    }
    check();
    if (!current?.ready) throw new Error('Browser lifecycle unavailable');
  };
  const run: BrowserRunner = async (path, body) => {
    if (active) throw new Error('Browser already active');
    active = true;
    let used: Session | undefined;
    try {
      await ensure();
      used = current!;
      used.calls++;
      totalCalls++;
      executing = true;
      if (used.calls >= 160 && !used.attempted) void prepare().catch(() => undefined);
      return await bounded(createBrowserRunner(used.page!)(path, body), 18000);
    } catch (error) {
      if (used) await retire(used, 'request-failed');
      throw error;
    } finally {
      executing = false;
      active = false;
      if (used && !used.retired && (used.calls >= 200 || Date.now() - used.born >= MAX_AGE))
        quietly(used, 'rotation');
      promote();
      if (!current && !closed && !failed && !preparing) void prepare().catch(() => undefined);
    }
  };
  return {
    run,
    start: ensure,
    async close() {
      closed = true;
      shutdownDeadline ||= Date.now() + 10000;
      for (const session of sessions) quietly(session, 'shutdown');
      if (timer) clearInterval(timer);
      timer = undefined;
      await preparing?.catch(() => undefined);
      await maintenance;
      const deadline = shutdownDeadline;
      const results = await Promise.allSettled(
        [...sessions].map((s) => retire(s, 'shutdown', deadline)),
      );
      const rejected = results.find((r) => r.status === 'rejected');
      if (rejected) throw rejected.reason;
      if (failed) throw failed;
    },
    status: () => ({
      state: failed
        ? 'failed'
        : closed
          ? 'closed'
          : current?.ready
            ? 'ready'
            : preparing
              ? 'starting'
              : 'idle',
      active,
      calls: current?.calls || 0,
      totalCalls,
      rotations,
      rssBytes,
      pages: current?.context?.pages().length || 0,
      reason,
      preparing: Boolean(preparing),
      owned: sessions.size,
    }),
  };
}
