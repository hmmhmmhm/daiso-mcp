/** Safari의 소유 작업창을 요청마다 빌리고 반환하는 전송입니다. */
import { execFile, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBrowserRunner, BrowserRequestError } from './browser.js';
import type { Page } from 'playwright';

type SafariFailureStage =
  'preflight' | 'start' | 'navigate' | 'initial-evaluate' | 'result-poll' | 'stop';
type SafariCleanupResult =
  | 'success' | 'failed' | 'not-attempted';
type SafariCleanupDetail =
  | 'stop-timeout' | 'stop-os-error' | 'stop-output-decode-error' | 'stop-unknown';
type SafariDiagnosticOutcome =
  | `safari-stage-${SafariFailureStage}`
  | `safari-cleanup-${SafariCleanupResult}`
  | `safari-cleanup-detail-${SafariCleanupDetail}`;
const safariDiagnostic =
  /^Safari relay diagnostic stage=(preflight|start|navigate|initial-evaluate|result-poll|stop) cleanup=(success|failed|not-attempted)(?: detail=(stop-timeout|stop-os-error|stop-output-decode-error|stop-unknown))?$/;

export function createSafariLifecycle(
  stateDir: string,
  onEvent?: (outcome: SafariDiagnosticOutcome) => void | Promise<void>,
) {
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
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAt = 0;
  const report = (outcome: SafariDiagnosticOutcome) => {
    try {
      const result = onEvent?.(outcome);
      if (result) void result.catch(() => undefined);
    } catch {
      // 진단 기록 실패는 helper 오류 처리를 바꾸지 않습니다.
    }
  };
  const closed = () => state === 'closed';
  const execute = (input?: string): Promise<unknown> => {
    pending = new Promise((resolve, reject) => {
      child = execFile(
        '/usr/bin/python3',
        ['-I', helper, stateDir, ...(input ? [] : ['--check'])],
        {
          env,
          // 창 준비·이동·회수 시간은 원본 fetch의15초 예산과 별도로 둡니다.
          timeout: 30000,
          killSignal: 'SIGTERM',
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          clearTimeout(hardStop);
          child = undefined;
          if (error || closed()) {
            if (error && typeof stderr === 'string' && stderr.length <= 128) {
              const line = stderr.endsWith('\n') ? stderr.slice(0, -1) : stderr;
              const match = safariDiagnostic.exec(line);
              if (match && (!match[3] || match[2] === 'failed')) {
                const stage = match[1] as SafariFailureStage;
                const cleanup = match[2] as SafariCleanupResult;
                report(`safari-stage-${stage}`);
                report(`safari-cleanup-${cleanup}`);
                if (match[3]) report(`safari-cleanup-detail-${match[3] as SafariCleanupDetail}`);
              }
            }
            return reject(new BrowserRequestError('safari-helper'));
          }
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
        owned.kill('SIGKILL');
      }, 45000);
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
  const scheduleRecovery = () => {
    if (recoveryTimer || closed()) return;
    retryAt = Date.now() + 60000;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      retryAt = 0;
      void start().catch(() => undefined);
    }, 60000);
    recoveryTimer.unref();
  };
  const assertReady = () => {
    if (closed()) throw new Error('Safari lifecycle closed');
    if (state !== 'ready') throw new Error('Safari lifecycle not ready');
    if (active) throw new Error('Safari lifecycle already active');
  };
  const runTask = async <T>(task: () => Promise<T>): Promise<T> => {
    assertReady();
    active = true;
    calls++;
    try {
      return await task();
    } catch (error) {
      if (error instanceof BrowserRequestError && error.reason === 'safari-helper') {
        uncertain = true;
        if (!closed()) state = 'failed';
        scheduleRecovery();
      }
      throw error;
    } finally {
      active = false;
    }
  };
  const start = async () => {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
    retryAt = 0;
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
  };
  return {
    start,
    assertReady,
    run: (path: string, body: Record<string, unknown>) => runTask(() => runner(path, body)),
    evaluate: (script: string, args: Record<string, unknown>) =>
      runTask(() => execute(JSON.stringify({ script, args }))),
    async close() {
      state = 'closed';
      clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      retryAt = 0;
      child?.kill('SIGTERM');
      await pending?.catch(() => undefined);
    },
    status: () => ({
      state,
      transport: 'safari',
      recoveryManaged: true,
      browserRequired: true,
      sharedBrowser: true,
      pages: uncertain ? null : active ? 1 : 0,
      recoveryRequired: uncertain,
      retryAt,
      active,
      calls,
      totalCalls: calls,
      rotations: 0,
      rssBytes: null,
      reason: closed() ? 'shutdown' : 'safari',
    }),
  };
}
