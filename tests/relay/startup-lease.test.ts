import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fork: vi.fn(), snapshot: vi.fn() }));
vi.mock('node:child_process', () => ({ fork: mocks.fork }));
vi.mock('playwright', () => ({ chromium: { connect: async () => ({ newContext: vi.fn() }) } }));
vi.mock('../../scripts/relay/ownership.js', async (original) => ({
  ...(await original<typeof import('../../scripts/relay/ownership.js')>()),
  processSnapshot: mocks.snapshot,
}));
import { launchGuardedBrowser } from '../../scripts/relay/supervisor.js';
it('동시 시작은 보존 이동과 새 마커 획득 사이에도 직렬화된다', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'oy-concurrent-start-')));
  const p = join(dir, 'owner.json');
  const root = {
    pid: 123,
    ppid: 122,
    pgid: 123,
    rss: 0,
    birth: 'old',
    crashDir: p + '.old.crashpad',
  };
  const current = {
    ...root,
    pid: 457,
    ppid: 456,
    pgid: 457,
    birth: 'new',
    crashDir: p + '.new.crashpad',
  };
  const child = Object.assign(new EventEmitter(), {
    pid: 456,
    connected: true,
    send: vi.fn(() => queueMicrotask(() => child.emit('exit', 0))),
  });
  mocks.fork.mockReturnValue(child);
  mocks.snapshot.mockResolvedValue([]);
  try {
    await writeFile(p, JSON.stringify({ guardPid: 122, browser: root }), { mode: 0o600 });
    const first = launchGuardedBrowser(p);
    await vi.waitFor(() => expect(mocks.fork).toHaveBeenCalledTimes(1));
    await writeFile(p, JSON.stringify({ guardPid: 456, browser: current }), { mode: 0o600 });
    await expect(launchGuardedBrowser(p)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(JSON.parse(await readFile(p, 'utf8')).browser).toEqual(current);
    child.emit('message', { type: 'ready', endpoint: 'ws://localhost', root: current });
    const owner = await first;
    mocks.snapshot.mockResolvedValue([current]);
    await expect(launchGuardedBrowser(p)).rejects.toThrow('ownership unconfirmed');
    expect(mocks.fork).toHaveBeenCalledTimes(1);
    await owner.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
