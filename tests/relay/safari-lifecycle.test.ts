import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const exec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile: exec }));
import { createSafariLifecycle } from '../../scripts/relay/safari-lifecycle.js';
import { createRelayWatchdog } from '../../scripts/relay/watchdog.js';
let done: (error: Error | null, stdout: string) => void;
let child: EventEmitter & { stdin: PassThrough; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  exec.mockReset();
  exec.mockImplementation((_cmd, _args, _opts, callback) => {
    done = callback;
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      kill: vi.fn(() => {
        done(new Error('terminated'), '');
        return true;
      }),
    });
    return child;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function ready() {
  const x = createSafariLifecycle('/state');
  const start = x.start();
  done(null, '{"ready":true}');
  await start;
  return x;
}
it('Safari 전용 전송은 Chrome을 시작하지 않고 비밀 없는 환경으로 준비한다', async () => {
  vi.stubEnv('OY_RELAY_TOKEN', 'secret');
  const x = await ready();
  expect(exec.mock.calls[0][1]).toContain('--check');
  expect(exec.mock.calls[0][2].env).not.toHaveProperty('OY_RELAY_TOKEN');
  expect(x.status()).toMatchObject({ transport: 'safari', state: 'ready', pages: 0 });
  await x.start();
  expect(exec).toHaveBeenCalledTimes(1);
  await x.close();
});
it('고정 fetch를 전달하고 원본 성공 판정을 재사용한다', async () => {
  const x = await ready();
  const call = x.run('/oystore/api/stock/stock-stores', { productId: 'x' });
  const input = JSON.parse(child.stdin.read().toString());
  expect(input.args.path).toBe('/oystore/api/stock/stock-stores');
  expect(input.script).toContain('fetch');
  expect(x.status().active).toBe(true);
  await expect(x.run('x', {})).rejects.toThrow('active');
  done(null, JSON.stringify({ status: 200, body: { status: 'SUCCESS', data: {} } }));
  await expect(call).resolves.toEqual({ status: 'SUCCESS', data: {} });
  expect(x.status()).toMatchObject({ active: false, calls: 1 });
  await x.close();
});
it.each(['bad JSON', 'null', '{"status":403,"body":null}'])(
  '실패를 품절이나 성공으로 바꾸지 않는다: %s',
  async (output) => {
    const x = await ready();
    const call = x.run('/x', {});
    done(null, output);
    await expect(call).rejects.toThrow();
    await x.close();
  },
);
it('시작 전 요청을 거절한다', async () => {
  const x = createSafariLifecycle('/state');
  await expect(x.run('x', {})).rejects.toThrow('ready');
  await x.close();
});
it('자식 오류 원문을 노출하지 않고 정상 정리 신호를 보낸다', async () => {
  const x = await ready();
  const call = x.run('x', {});
  const rejected = expect(call).rejects.toThrow('safari-helper');
  await x.close();
  await rejected;
  expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  await expect(x.run('x', {})).rejects.toThrow('closed');
  await expect(x.start()).rejects.toThrow('closed');
});
it('준비 실패는 재시도 가능하며 동시에 준비할 때 하나만 실행한다', async () => {
  const x = createSafariLifecycle('/state');
  const a = x.start(),
    b = x.start();
  const caught = Promise.allSettled([a, b]);
  expect(exec).toHaveBeenCalledTimes(1);
  done(new Error('private'), 'private');
  expect((await caught).every((v) => v.status === 'rejected')).toBe(true);
  const retry = x.start();
  done(null, '{"ready":true}');
  await retry;
  await x.close();
});
it('준비 응답이 잘못되면 거절한다', async () => {
  const x = createSafariLifecycle('/state');
  const a = x.start();
  done(null, '{}');
  await expect(a).rejects.toThrow();
  await x.close();
});
it('요청 중 helper 실패와 stdin 오류는 인증 정보를 감춘다', async () => {
  const x = await ready();
  const a = x.run('x', {});
  child.stdin.emit('error', new Error('private'));
  await expect(a).rejects.toThrow('safari-helper');
  await x.close();
});

it('다른 Safari 작업의 잠금을 원본 오류와 구분한다', async () => {
  const x = await ready();
  const a = x.run('x', {});
  done(null, '{"relayError":"safari-busy"}');
  await expect(a).rejects.toThrow('safari-busy');
  await x.close();
});
it('정상 종료가 멈춘 helper만 강제 종료하고 Safari 본체는 대상으로 삼지 않는다', async () => {
  vi.useFakeTimers();
  const x = await ready();
  const a = x.run('x', {});
  const rejected = expect(a).rejects.toThrow('safari-helper');
  await vi.advanceTimersByTimeAsync(35000);
  await rejected;
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  await x.close();
});

it.each([false, true])('소유 helper 그룹만 회수한다: kill 오류 %s', async (failure) => {
  vi.useFakeTimers();
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    if (failure) throw new Error('exited');
    done(new Error('killed'), '');
    return true;
  });
  const x = await ready();
  const a = x.run('x', {});
  const rejection = expect(a).rejects.toThrow('safari-helper');
  Object.assign(child, { pid: 12345 });
  await vi.advanceTimersByTimeAsync(35000);
  await rejection;
  expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
  await x.close();
});

it('준비 중 닫아도 실패 상태로 되살리지 않는다', async () => {
  const x = createSafariLifecycle('/state');
  const a = x.start();
  const rejection = expect(a).rejects.toThrow('safari-helper');
  await x.close();
  await rejection;
  expect(x.status().state).toBe('closed');
  expect(x.status().reason).toBe('shutdown');
});
it('helper 회수 실패를 ready나 페이지 0으로 숨기지 않는다', async () => {
  const x = await ready();
  const a = x.run('x', {});
  done(new Error('failed'), '');
  await expect(a).rejects.toThrow();
  expect(x.status()).toMatchObject({ state: 'failed', pages: null, recoveryRequired: true });
  const recovery = x.start();
  done(null, '{"ready":true}');
  await recovery;
  expect(x.status()).toMatchObject({ state: 'ready', pages: 0, recoveryRequired: false });
  await x.close();
});

it('세븐일레븐의 고정 공개 조회도 같은 수명 보호로 실행한다', async () => {
  const x = await ready();
  const a = x.evaluate('async () => ({})', {
    origin: 'https://new.7-elevenapp.co.kr',
    path: '/api/v1/open/search/goods',
  });
  done(null, '{"status":200,"text":"{}"}');
  await expect(a).resolves.toEqual({ status: 200, text: '{}' });
  await x.close();
});

it('helper 오류 뒤60초에 소유 상태만 한 번 재확인하고 정상 복귀한다', async () => {
  vi.useFakeTimers();
  const x = await ready();
  const call = x.run('x', {});
  done(new Error('helper failed'), '');
  await expect(call).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(59999);
  expect(exec).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(exec).toHaveBeenCalledTimes(3);
  expect(exec.mock.calls[2][1]).toContain('--check');
  done(null, '{"ready":true}');
  await Promise.resolve();
  await Promise.resolve();
  expect(x.status()).toMatchObject({ state: 'ready', recoveryRequired: false });
  await x.close();
});
it('소유 확인 실패는 무한 재시도하지 않고 종료하면 예약도 취소한다', async () => {
  vi.useFakeTimers();
  const x = await ready();
  const call = x.run('x', {});
  done(new Error('failed'), '');
  await expect(call).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(60000);
  done(new Error('ownership unresolved'), '');
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(60000);
  expect(exec).toHaveBeenCalledTimes(3);
  expect(x.status().state).toBe('failed');
  await x.close();
});

it('정상 종료는 예약된 소유 상태 재확인을 취소한다', async () => {
  vi.useFakeTimers();
  const x = await ready();
  const call = x.run('x', {});
  done(new Error('failed'), '');
  await expect(call).rejects.toThrow();
  await x.close();
  await vi.advanceTimersByTimeAsync(60000);
  expect(exec).toHaveBeenCalledTimes(2);
  expect(x.status()).toMatchObject({ state: 'closed', retryAt: 0 });
});
it('수동 준비 성공은 이전 실패의 재확인 예약을 취소한다', async () => {
  vi.useFakeTimers();
  const x = await ready();
  const call = x.run('x', {});
  done(new Error('failed'), '');
  await expect(call).rejects.toThrow();
  const start = x.start();
  done(null, '{"ready":true}');
  await start;
  await vi.advanceTimersByTimeAsync(60000);
  expect(exec).toHaveBeenCalledTimes(3);
  expect(x.status()).toMatchObject({ state: 'ready', retryAt: 0 });
  await x.close();
});

it('실제 watchdog과 같이 써도 Safari의 단발 재확인을 앞당기거나 반복하지 않는다', async () => {
  vi.useFakeTimers();
  const x = await ready();
  const tick = createRelayWatchdog(x);
  const call = x.run('x', {});
  done(new Error('failed'), '');
  await expect(call).rejects.toThrow();
  const firstTick = tick();
  expect(exec).toHaveBeenCalledTimes(2);
  await firstTick;
  await vi.advanceTimersByTimeAsync(60000);
  done(new Error('still unresolved'), '');
  await Promise.resolve();
  await Promise.resolve();
  await tick();
  await vi.advanceTimersByTimeAsync(60000);
  await tick();
  expect(exec).toHaveBeenCalledTimes(3);
  await x.close();
});
