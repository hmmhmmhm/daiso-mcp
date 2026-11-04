/** Safari의 소유 작업창을 요청마다 빌리고 반환하는 전송입니다. */
import { execFile, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBrowserRunner, BrowserRequestError } from './browser.js';
import type { Page } from 'playwright';

export function createSafariLifecycle(stateDir: string) {
  const helper = fileURLToPath(new URL('./oliveyoung-safari.py', import.meta.url));
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'LANG', '__CF_USER_TEXT_ENCODING']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]!]),
  );
  let state = 'idle';
  let active = false;
  let calls = 0;
  let uncertain = false;
  let child: ChildProcess | undefined;
  let pending: Promise<unknown> | undefined;
  let starting: Promise<void> | undefined;
  const closed = () => state === 'closed';
  const execute = (input?: string): Promise<unknown> => {
    pending = new Promise((resolve, reject) => {
      child = execFile(
        '/usr/bin/python3',
        ['-I', helper, stateDir, ...(input ? [] : ['--check'])],
        {
          env,
          detached: true,
          timeout: 18000,
          killSignal: 'SIGTERM',
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, stdout) => {
          clearTimeout(hardStop);
          child = undefined;
          if (error || closed()) return reject(new BrowserRequestError('safari-helper'));
          try {
            const output = JSON.parse(stdout);
            if (output?.relayError === 'safari-busy')
              return reject(new BrowserRequestError('safari-busy'));
            resolve(output);
          } catch {
            reject(new BrowserRequestError('safari-helper'));
          }
        },
      );
      const owned = child;
      const hardStop = setTimeout(() => {
        if (owned.pid) {
          try {
            process.kill(-owned.pid, 'SIGKILL');
          } catch {
            owned.kill('SIGKILL');
          }
        } else owned.kill('SIGKILL');
      }, 35000);
      hardStop.unref();
      // SIGTERM은 소유 창 정리 finally를 실행하며 공유 Safari를 종료하지 않습니다.
      child.stdin!.on('error', () => owned.kill('SIGTERM'));
      child.stdin!.end(input);
    });
    return pending;
  };
  const runner = createBrowserRunner({
    evaluate: ((fn: unknown, args: unknown) =>
      execute(JSON.stringify({ script: String(fn), args }))) as Page['evaluate'],
  });
  const runTask = async <T>(task: () => Promise<T>): Promise<T> => {
    if (closed()) throw new Error('Safari lifecycle closed');
    if (state !== 'ready') throw new Error('Safari lifecycle not ready');
    if (active) throw new Error('Safari lifecycle already active');
    active = true;
    calls++;
    try {
      return await task();
    } catch (error) {
      if (error instanceof BrowserRequestError && error.reason === 'safari-helper') {
        uncertain = true;
        if (!closed()) state = 'failed';
      }
      throw error;
    } finally {
      active = false;
    }
  };
  return {
    async start() {
      if (closed()) throw new Error('Safari lifecycle closed');
      if (state === 'ready') return;
      starting ??= (async () => {
        state = 'starting';
        try {
          if (((await execute()) as { ready?: boolean })?.ready !== true)
            throw new BrowserRequestError('safari-helper');
          state = 'ready';
          uncertain = false;
        } catch (error) {
          uncertain = true;
          if (!closed()) state = 'failed';
          throw error;
        } finally {
          starting = undefined;
        }
      })();
      await starting;
    },
    run: (path: string, body: Record<string, unknown>) => runTask(() => runner(path, body)),
    evaluate: (script: string, args: Record<string, unknown>) =>
      runTask(() => execute(JSON.stringify({ script, args }))),
    async close() {
      state = 'closed';
      child?.kill('SIGTERM');
      await pending?.catch(() => undefined);
    },
    status: () => ({
      state,
      transport: 'safari',
      browserRequired: true,
      sharedBrowser: true,
      pages: uncertain ? null : active ? 1 : 0,
      recoveryRequired: uncertain,
      active,
      calls,
      totalCalls: calls,
      rotations: 0,
      rssBytes: null,
      reason: closed() ? 'shutdown' : 'safari',
    }),
  };
}
