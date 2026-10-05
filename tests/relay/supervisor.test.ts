import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fork: vi.fn(), connect: vi.fn(), snapshot: vi.fn() }));
vi.mock('node:child_process', () => ({ fork: mocks.fork }));
vi.mock('playwright', () => ({ chromium: { connect: mocks.connect } }));
vi.mock('../../scripts/relay/ownership.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../scripts/relay/ownership.js')>()),
  processSnapshot: mocks.snapshot,
}));
import { launchGuardedBrowser } from '../../scripts/relay/supervisor.js';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
const root = { pid: 123, ppid: 1, pgid: 123, rss: 10, birth: 'start' };
function fixture() {
  const child = Object.assign(new EventEmitter(), { connected: true, send: vi.fn() });
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
  child.emit('message', { type: 'ready', endpoint: 'ws://localhost', root });
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
  child.emit('exit', 1);
  await rejected;
  expect(mocks.connect).not.toHaveBeenCalled();
});
it('브라우저 연결 실패도 소유 감시 프로세스를 종료한다', async () => {
  const child = fixture();
  mocks.connect.mockRejectedValue(new Error('connect failed'));
  const pending = launchGuardedBrowser('/tmp/test-owner');
  child.emit('message', { type: 'ready', endpoint: 'ws://localhost', root });
  await expect(pending).rejects.toThrow('connect failed');
  expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'close' }));
});
it('감시 프로세스 종료가 멈추면 확인 실패로 종료한다', async () => {
  vi.useFakeTimers();
  const child = fixture();
  child.send.mockImplementation(() => {});
  const pending = launchGuardedBrowser('/tmp/test-owner');
  child.emit('message', { type: 'ready', endpoint: 'ws://localhost', root });
  const owner = await pending;
  child.connected = false;
  const closing = owner.close();
  const rejected = expect(closing).rejects.toThrow('watchdog');
  await vi.advanceTimersByTimeAsync(9000);
  await rejected;
  expect(child.send).not.toHaveBeenCalled();
});
it('수명 계층의 종료 기한을 IPC에 그대로 전달한다', async () => {
  const child = fixture();
  const pending = launchGuardedBrowser('/tmp/test-owner');
  child.emit('message', { type: 'ready', endpoint: 'ws://localhost', root });
  const owner = await pending;
  const deadline = Date.now() + 6000;
  await owner.close(deadline);
  expect(child.send).toHaveBeenCalledWith({ type: 'close', deadline });
});
