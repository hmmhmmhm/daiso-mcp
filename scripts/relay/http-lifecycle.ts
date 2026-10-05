/** 고정 Python 헬퍼의 시작·요청·종료를 브라우저 없이 관리합니다. */
import { execFile, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { BrowserRunner } from './oliveyoung.js';
const LIMIT = 2 * 1024 * 1024;
export function createHttpLifecycle() {
  const python = process.env.OY_HTTP_PYTHON || 'python3';
  const helper = fileURLToPath(new URL('./oliveyoung-http.py', import.meta.url));
  // 토큰·프록시·Python 설정은 전달하지 않고 실행 파일 탐색 경로만 허용합니다.
  const env = { PATH: process.env.PATH || '/usr/bin:/bin' };
  let state: 'starting' | 'ready' | 'closed' = 'starting';
  const isClosed = () => state === 'closed';
  let child: ChildProcess | undefined;
  let pending: Promise<string> | undefined;
  let starting: Promise<void> | undefined;
  let active = false;
  let calls = 0;
  const execute = (check: boolean, input?: string) => {
    pending = new Promise<string>((resolve, reject) => {
      child = execFile(
        python,
        ['-I', helper, ...(check ? ['--check'] : [])],
        {
          env,
          timeout: 18000,
          killSignal: 'SIGKILL',
          maxBuffer: LIMIT,
          encoding: 'utf8',
        },
        (error, stdout) => {
          child = undefined;
          if (error || isClosed()) reject(new Error('HTTP relay request failed'));
          else resolve(stdout);
        },
      );
      // 출력 파이프 종료는 콜백에서 처리하고 입력 오류는 비밀 없이 보고합니다.
      child.stdin!.on('error', () => child?.kill('SIGKILL'));
      child.stdin!.end(input);
    });
    return pending;
  };
  const start = async () => {
    if (isClosed()) throw new Error('HTTP lifecycle closed');
    if (state === 'ready') return;
    starting ??= (async () => {
      const output = await execute(true);
      try {
        if (JSON.parse(output)?.ready !== true) throw new Error();
      } catch {
        throw new Error('HTTP relay request failed');
      }
      if (isClosed()) throw new Error('HTTP lifecycle closed');
      state = 'ready';
    })();
    await starting;
  };
  const run: BrowserRunner = async (path, body) => {
    if (isClosed()) throw new Error('HTTP lifecycle closed');
    if (state !== 'ready') throw new Error('HTTP lifecycle not ready');
    if (active) throw new Error('HTTP lifecycle already active');
    active = true;
    calls++;
    try {
      const input = JSON.stringify({ path, body });
      if (Buffer.byteLength(input) > LIMIT) throw new Error();
      const result = JSON.parse(await execute(false, input));
      if (
        !result ||
        result.status !== 'SUCCESS' ||
        !result.data ||
        typeof result.data !== 'object' ||
        Array.isArray(result.data)
      )
        throw new Error();
      return result;
    } catch {
      throw new Error('HTTP relay request failed');
    } finally {
      active = false;
    }
  };
  return {
    start,
    run,
    async close() {
      state = 'closed';
      child?.kill('SIGKILL');
      await pending?.catch(() => undefined);
    },
    status: () => ({
      state,
      transport: 'http',
      browserRequired: false,
      pages: 0,
      active,
      calls,
      totalCalls: calls,
      rotations: 0,
      rssBytes: 0,
      reason: state === 'closed' ? 'shutdown' : 'http',
    }),
  };
}
