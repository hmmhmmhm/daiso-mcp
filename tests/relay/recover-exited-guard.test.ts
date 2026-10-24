import { mkdtemp, readFile, writeFile, symlink, readdir, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recoverExitedGuard } from '../../scripts/relay/recover-exited-guard.js';
const changes = vi.hoisted(() => ({ mode: 'normal' }));
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>();
  return {
    ...real,
    lstat: async (...args: Parameters<typeof real.lstat>) => {
      const value = await real.lstat(...args);
      if (changes.mode === 'device') Object.assign(value, { dev: -1 });
      if (changes.mode === 'expire') vi.setSystemTime(Date.now() + 6000);
      return value;
    },
    rename: async (...args: Parameters<typeof real.rename>) => {
      if (changes.mode === 'rename') throw new Error('archive failed');
      return real.rename(...args);
    },
  };
});
let dir: string;
let path: string;
let root: { pid: number; ppid: number; pgid: number; rss: number; birth: string; crashDir: string };
const snapshot = vi.fn();
beforeEach(async () => {
  changes.mode = 'normal';
  dir = await mkdtemp(join(tmpdir(), 'oy-guard-recovery-'));
  path = join(dir, 'owner.json');
  root = {
    pid: 123,
    ppid: 122,
    pgid: 123,
    rss: 10,
    birth: 'original',
    crashDir: path + '.unique.crashpad',
  };
  await writeFile(path, JSON.stringify({ guardPid: 122, browser: root }), { mode: 0o600 });
  snapshot.mockReset().mockResolvedValue([]);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});
it('감시자와 소유 그룹이 모두 사라진 경우에만 마커를 보존 이동한다', async () => {
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(true);
  const names = await readdir(dir);
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^owner.json\.exited-/);
  expect(JSON.parse(await readFile(join(dir, names[0]), 'utf8')).browser).toEqual(root);
});
it.each([
  { pid: 122, pgid: 999 },
  { pid: 123, pgid: 999 },
  { pid: 999, pgid: 123 },
])('PID 재사용이나 잔여 프로세스가 있으면 이동하지 않는다: %j', async (row) => {
  snapshot.mockResolvedValue([{ ...root, ...row, birth: 'reused' }]);
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
  expect(await readdir(dir)).toEqual(['owner.json']);
});
it('다른 프로세스 그룹의 전용 crashpad도 남아 있으면 차단한다', async () => {
  snapshot.mockResolvedValue([
    {
      ...root,
      pid: 999,
      pgid: 999,
      command: 'chrome_crashpad_handler --database=' + root.crashDir,
    },
  ]);
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
});
it('snapshot 실패는 종료 증거가 아니다', async () => {
  snapshot.mockRejectedValue(new Error('ps failed'));
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
});
it('기한 이후 도착한 snapshot은 나중에도 마커를 이동하지 않는다', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  snapshot.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), 100)));
  const task = recoverExitedGuard(path, 122, root, Date.now() + 50, snapshot);
  while (!snapshot.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  await vi.advanceTimersByTimeAsync(200);
  expect(await task).toBe(false);
  expect(await readdir(dir)).toEqual(['owner.json']);
});
it.each(['guardPid', 'pid', 'pgid', 'birth', 'crashDir'])(
  '마커의 %s 식별자가 다르면 차단한다',
  async (key) => {
    const marker = { guardPid: 122, browser: { ...root } };
    if (key === 'guardPid') marker.guardPid = 999;
    else Object.assign(marker.browser, { [key]: 'different' });
    await writeFile(path, JSON.stringify(marker));
    expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
  },
);
it.each(['', '{', ' '.repeat(16385), 'null'])('불완전하거나 큰 마커를 거절한다', async (body) => {
  await writeFile(path, body);
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
});
it('심볼릭 링크는 따라가지 않는다', async () => {
  const link = path + '.link';
  const linkedRoot = { ...root, crashDir: link + '.unique.crashpad' };
  await writeFile(path, JSON.stringify({ guardPid: 122, browser: linkedRoot }));
  await symlink(path, link);
  expect(await recoverExitedGuard(link, 122, linkedRoot, Date.now() + 5000, snapshot)).toBe(false);
  expect(JSON.parse(await readFile(path, 'utf8')).guardPid).toBe(122);
});
it('snapshot 중 마커가 교체되면 새 마커를 이동하지 않는다', async () => {
  snapshot.mockImplementation(async () => {
    await rm(path);
    await writeFile(path, JSON.stringify({ guardPid: 999 }));
    return [];
  });
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
  expect(JSON.parse(await readFile(path, 'utf8')).guardPid).toBe(999);
});

it.each(['device', 'rename', 'expire'])(
  '장치 변경·이동 실패·기한 만료를 성공으로 바꾸지 않는다: %s',
  async (mode) => {
    if (mode === 'expire') vi.useFakeTimers({ toFake: ['Date'] });
    changes.mode = mode;
    expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
    expect(await readdir(dir)).toEqual(['owner.json']);
  },
);
it('다른 UID의 마커를 이동하지 않는다', async () => {
  const uid = process.getuid!();
  vi.spyOn(process, 'getuid').mockReturnValue(uid + 1);
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
});
it('디렉터리를 마커로 사용하지 않는다', async () => {
  await rm(path);
  await mkdir(path);
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
});
it.each([undefined, '/unrelated.crashpad'])(
  '고유 crashDir 증거가 없으면 거절한다',
  async (crashDir) => {
    expect(
      await recoverExitedGuard(path, 122, { ...root, crashDir }, Date.now() + 5000, snapshot),
    ).toBe(false);
  },
);
it('브라우저 정보가 없으면 소유권을 추측하지 않는다', async () => {
  await writeFile(path, JSON.stringify({ guardPid: 122 }));
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 5000, snapshot)).toBe(false);
});
it('기본 운영 프로세스 스냅샷으로도 완전 소멸을 확인한다', async () => {
  const missingRoot = { ...root, pid: 2147483000, pgid: 2147483000 };
  await writeFile(path, JSON.stringify({ guardPid: 2147483001, browser: missingRoot }));
  expect(await recoverExitedGuard(path, 2147483001, missingRoot, Date.now() + 5000)).toBe(true);
});

it('FIFO 마커도 파일 열기에서 멈추지 않고 거절한다', async () => {
  await rm(path);
  execFileSync('/usr/bin/mkfifo', [path]);
  expect(await recoverExitedGuard(path, 122, root, Date.now() + 1000, snapshot)).toBe(false);
});
