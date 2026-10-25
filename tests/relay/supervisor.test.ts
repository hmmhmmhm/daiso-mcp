import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  fork: vi.fn(),
  connect: vi.fn(),
  snapshot: vi.fn(),
  recover: vi.fn(),
}));
vi.mock('node:child_process', () => ({ fork: mocks.fork }));
vi.mock('playwright', () => ({ chromium: { connect: mocks.connect } }));
vi.mock('../../scripts/relay/ownership.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../scripts/relay/ownership.js')>()),
  processSnapshot: mocks.snapshot,
}));
vi.mock('../../scripts/relay/recover-exited-guard.js', () => ({
  recoverExitedGuard: mocks.recover,
}));
vi.mock('../../scripts/relay/marker-lease.js', () => ({
  acquireMarkerLease: async (markerPath: string) => Object.assign(async () => {}, { markerPath }),
}));
import { launchGuardedBrowser } from '../../scripts/relay/supervisor.js';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
const root = { pid: 123, ppid: 1, pgid: 123, rss: 10, birth: 'start' };
async function ready(child: EventEmitter) {
  while (!child.listenerCount('message')) await Promise.resolve();
  child.emit('message', { type: 'other' });
  child.emit('message', { type: 'ready', endpoint: 'ws://localhost', root });
}
function fixture() {
  const child = Object.assign(new EventEmitter(), { pid: 122, connected: true, send: vi.fn() });
  mocks.fork.mockReturnValue(child);
  mocks.connect.mockResolvedValue({ newContext: vi.fn() });
  mocks.snapshot.mockResolvedValue([root, { ...root, pid: 124, rss: 20 }]);
  child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', 0)));
  return child;
}
it('준비된 소유 브라우저에 연결하고 그룹 RSS 및 정상 종료를 제공한다', async () => {
  const child = fixture();
  const pending = launchGuardedBrowser('/tmp/test-owner');
  child.emit('message', { type: 'other' });
  await ready(child);
  const owner = await pending;
  expect(await owner.rss()).toBe(30);
  expect(owner.pid).toBe(123);
  await owner.close();
  expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'close' }));
  await owner.close();
  expect(child.send).toHaveBeenCalledTimes(1);
});
it('준비 전 감시 프로세스 종료는 후속 실행을 허용하지 않는다', async () => {
  const child = fixture();
  const pending = launchGuardedBrowser('/tmp/test-owner');
  const rejected = expect(pending).rejects.toThrow('cleanup unconfirmed');
  while (!child.listenerCount('exit')) await Promise.resolve();
  child.emit('exit', 1);
  await rejected;
  expect(mocks.connect).not.toHaveBeenCalled();
});
it('브라우저 연결 실패도 소유 감시 프로세스를 종료한다', async () => {
  const child = fixture();
  mocks.connect.mockRejectedValue(new Error('connect failed'));
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  await expect(pending).rejects.toThrow('connect failed');
  expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'close' }));
});
it('감시 프로세스 종료가 멈추면 확인 실패로 종료한다', async () => {
  vi.useFakeTimers();
  const child = fixture();
  child.send.mockImplementation(() => {});
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await pending;
  child.connected = false;
  const closing = owner.close();
  const rejected = expect(closing).rejects.toThrow('watchdog');
  await vi.advanceTimersByTimeAsync(9000);
  await rejected;
  expect(child.send).not.toHaveBeenCalled();
  child.emit('exit', 1);
  expect(mocks.recover).not.toHaveBeenCalled();
});
it('수명 계층의 종료 기한을 IPC에 그대로 전달한다', async () => {
  const child = fixture();
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await pending;
  const deadline = Date.now() + 6000;
  await owner.close(deadline);
  expect(child.send).toHaveBeenCalledWith({ type: 'close', deadline });
});

it('준비된 감시자의 비정상 종료는 소멸 검증 후 다음 실행을 허용한다', async () => {
  const child = fixture();
  mocks.recover.mockResolvedValue(true);
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await pending;
  child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', 1)));
  await Promise.all([owner.close(), owner.close()]);
  await owner.close();
  expect(mocks.recover).toHaveBeenCalledTimes(1);
  expect(mocks.recover).toHaveBeenCalledWith('/tmp/test-owner', 122, root, expect.any(Number));
});
it.each([null, 1])('불확실한 종료(%s)는 검증되지 않으면 계속 실패한다', async (code) => {
  const child = fixture();
  mocks.recover.mockResolvedValue(false);
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await pending;
  child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', code)));
  await expect(owner.close()).rejects.toThrow('cleanup unconfirmed');
  expect(mocks.recover).toHaveBeenCalledTimes(code === null ? 0 : 1);
});

it('감시자 PID가 없으면 종료 소멸을 추측하지 않는다', async () => {
  const child = fixture();
  Object.assign(child, { pid: undefined });
  const task = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await task;
  child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', 1)));
  await expect(owner.close()).rejects.toThrow('cleanup unconfirmed');
  expect(mocks.recover).not.toHaveBeenCalled();
});
it('실패한 원본 요청은 유지하고 소멸 확인 뒤 다음 요청에서 세션을 재생성한다', async () => {
  vi.useFakeTimers();
  const { createBrowserLifecycle } = await import('../../scripts/relay/lifecycle.js');
  mocks.recover.mockResolvedValue(true);
  const launch = vi.fn(async () => {
    const child = fixture();
    const page = Object.assign(new EventEmitter(), {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async () => {
        if (launch.mock.calls.length === 1) throw new Error('upstream failed');
        return { status: 200, body: { status: 'SUCCESS' } };
      }),
    });
    const context = Object.assign(new EventEmitter(), {
      newPage: vi.fn().mockResolvedValue(page),
      pages: () => [page],
    });
    mocks.connect.mockResolvedValue({ newContext: vi.fn().mockResolvedValue(context) });
    const pending = launchGuardedBrowser('/tmp/test-owner');
    await ready(child);
    child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', 1)));
    return pending;
  });
  const life = createBrowserLifecycle(launch);
  try {
    await life.start();
    await expect(life.run('/test', {})).rejects.toThrow('upstream failed');
    expect(life.status().state).toBe('idle');
    await vi.advanceTimersByTimeAsync(60001);
    await expect(life.run('/test', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(launch).toHaveBeenCalledTimes(2);
  } finally {
    await life.close();
  }
});

it('종료 기한 뒤 정상 종료된 감시자는 새 요청에서만 복구를 확인한다', async () => {
  vi.useFakeTimers();
  const child = fixture();
  child.send.mockImplementation(() => {});
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await pending;
  const rejected = expect(owner.close()).rejects.toThrow('watchdog');
  await vi.advanceTimersByTimeAsync(9000);
  await rejected;
  expect(await owner.recover!(Date.now() + 5000)).toBe(false);
  child.emit('exit', 0);
  expect(await owner.recover!(Date.now() + 5000)).toBe(true);
  expect(mocks.recover).not.toHaveBeenCalled();
});
it('늦게 소멸한 비정상 감시자는 새 기한의 소유권 확인 뒤에만 복구한다', async () => {
  const child = fixture();
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  const owner = await pending;
  child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', 1)));
  mocks.recover.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await expect(owner.close()).rejects.toThrow('cleanup unconfirmed');
  expect(await owner.recover!(Date.now() + 5000)).toBe(true);
  expect(mocks.recover).toHaveBeenCalledTimes(2);
});

it('기존 마커의 소멸을 재검증한 다음에만 새 감시자를 실행한다', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'oy-supervisor-startup-'));
  const p = join(dir, 'owner.json');
  const old = { ...root, ppid: 122, crashDir: p + '.unique.crashpad' };
  try {
    await writeFile(p, JSON.stringify({ guardPid: 122, browser: old }), { mode: 0o600 });
    mocks.recover.mockResolvedValue(false);
    await expect(launchGuardedBrowser(p)).rejects.toThrow('ownership unconfirmed');
    expect(mocks.fork).not.toHaveBeenCalled();
    mocks.recover.mockResolvedValue(true);
    const child = fixture();
    const pending = launchGuardedBrowser(p);
    await vi.waitFor(() => expect(mocks.fork).toHaveBeenCalledTimes(1));
    await ready(child);
    const owner = await pending;
    await owner.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it.each(['throw', 'reject'])('감시 종료 관측기의 %s 실패를 회수에서 격리한다', async (mode) => {
  const child = fixture();
  const event = vi.fn(() => {
    if (mode === 'throw') throw Error('private');
    return Promise.reject(Error('private'));
  });
  const pending = launchGuardedBrowser('/tmp/test-owner', event);
  await ready(child);
  const owner = await pending;
  await owner.close();
  expect(event).toHaveBeenCalledWith('guard-exit-normal');
});

it('시작 중 연결 실패도 같은 lease 안에서 비정상 감시자를 확인하고 해제한다', async () => {
  const child = fixture();
  mocks.connect.mockRejectedValueOnce(new Error('connect failed'));
  mocks.recover.mockResolvedValue(true);
  child.send.mockImplementation(() => queueMicrotask(() => child.emit('exit', 1)));
  const pending = launchGuardedBrowser('/tmp/test-owner');
  await ready(child);
  await expect(pending).rejects.toThrow('connect failed');
  expect(mocks.recover).toHaveBeenCalledTimes(1);
});
