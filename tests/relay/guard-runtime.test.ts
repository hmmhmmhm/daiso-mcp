import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { runGuard } from '../../scripts/relay/guard-runtime.js';
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp('/tmp/guard-unit-');
  dirs.push(dir);
  const marker = dir + '/owner.json';
  const root = { pid: 123, ppid: 1, pgid: 123, rss: 1, birth: 'start' };
  const snapshot = vi.fn().mockResolvedValue([root]);
  const server = {
    process: () => ({ pid: 123 }),
    wsEndpoint: () => 'ws://127.0.0.1/browser',
    close: vi.fn().mockImplementation(async () => {
      snapshot.mockResolvedValue([]);
    }),
    kill: vi.fn().mockResolvedValue(undefined),
  };
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn(),
    exit: vi.fn(),
  });
  return { marker, root, snapshot, server, channel };
}
it('소유 마커를 기록하고 부모 단절 시 종료 확인 후 삭제한다', async () => {
  const f = await fixture();
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  expect(JSON.parse(await readFile(f.marker, 'utf8')).browser.pid).toBe(123);
  expect(f.channel.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }));
  f.channel.connected = false;
  f.channel.emit('disconnect');
  await vi.waitFor(() => expect(f.channel.exit).toHaveBeenCalledWith(0));
  await expect(access(f.marker)).rejects.toThrow();
});
it('정상 IPC 종료 및 중복 종료는 한 번만 처리한다', async () => {
  const f = await fixture();
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  for (const message of [
    'noop',
    null,
    {},
    { type: 'other' },
    { type: 'close' },
    { type: 'close', deadline: 'bad' },
    { type: 'close', deadline: Infinity },
  ])
    f.channel.emit('message', message);
  f.channel.emit('message', 'close');
  f.channel.emit('SIGTERM');
  f.channel.emit('message', { type: 'close', deadline: Date.now() + 5000 });
  await vi.waitFor(() => expect(f.channel.exit).toHaveBeenCalledWith(0));
  expect(f.server.close).toHaveBeenCalledTimes(1);
  expect(f.channel.send).toHaveBeenCalledWith({ type: 'closed' });
});
it('실행 실패와 잘못된 소유권은 마커를 남긴다', async () => {
  const f = await fixture();
  f.snapshot.mockResolvedValue([]);
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  expect(f.server.kill).toHaveBeenCalledTimes(1);
  expect(f.channel.exit).toHaveBeenCalledWith(1);
  await access(f.marker);
  await expect(
    runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot),
  ).rejects.toThrow();
});
it('시작 당시 부모가 없으면 준비 상태를 보내지 않고 정리한다', async () => {
  const f = await fixture();
  f.channel.connected = false;
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  await vi.waitFor(() => expect(f.channel.exit).toHaveBeenCalledWith(0));
  expect(f.channel.send).not.toHaveBeenCalled();
  expect(f.channel.listenerCount('message')).toBe(0);
});
it('회수 중 소유권이 사라지면 마커를 보존하고 실패 종료한다', async () => {
  const f = await fixture();
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  f.snapshot.mockResolvedValue([{ ...f.root, pid: 124 }]);
  f.channel.emit('SIGINT');
  await vi.waitFor(() => expect(f.channel.exit).toHaveBeenCalledWith(1));
  await access(f.marker);
  expect(f.channel.listenerCount('message')).toBe(0);
});
it('IPC 공유 기한 안에 느린 close와 소멸 확인을 마치고 마커를 삭제한다', async () => {
  const f = await fixture();
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  vi.useFakeTimers();
  const started = Date.now();
  f.server.close.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 6900)));
  f.snapshot.mockImplementation(async () => (Date.now() - started < 5900 ? [f.root] : []));
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
  f.channel.emit('message', { type: 'close', deadline: started + 8000 });
  await vi.advanceTimersByTimeAsync(7000);
  kill.mockRestore();
  vi.useRealTimers();
  await vi.waitFor(() => expect(f.channel.exit).toHaveBeenCalledWith(0));
  await expect(access(f.marker)).rejects.toThrow();
});
it('최악 경로에서 프로필 종료가 공유 기한을 넘으면 확인 실패와 마커를 보존한다', async () => {
  const f = await fixture();
  await runGuard(f.marker, async () => f.server, f.channel, 1, f.snapshot);
  vi.useFakeTimers();
  const started = Date.now();
  f.server.close.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 8900)));
  f.snapshot.mockImplementation(async () => (Date.now() - started < 5900 ? [f.root] : []));
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
  f.channel.emit('message', { type: 'close', deadline: started + 8000 });
  await vi.advanceTimersByTimeAsync(7600);
  expect(f.channel.exit).toHaveBeenCalledWith(1);
  expect(f.channel.send).not.toHaveBeenCalledWith({ type: 'closed' });
  expect(kill).toHaveBeenCalledExactlyOnceWith(-123, 'SIGKILL');
  kill.mockRestore();
  vi.useRealTimers();
  await access(f.marker);
});
