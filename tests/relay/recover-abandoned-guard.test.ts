import { mkdtemp, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { recoverAbandonedGuard } from '../../scripts/relay/recover-abandoned-guard.js';
it('재시작 뒤에도 소유 기록과 전체 프로세스 소멸을 검증하여 보존 이동한다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oy-startup-'));
  const p = join(dir, 'owner.json');
  const root = {
    pid: 123,
    pgid: 123,
    ppid: 122,
    rss: 0,
    birth: 'birth',
    crashDir: p + '.unique.crashpad',
  };
  const marker = { guardPid: 122, browser: root };
  try {
    await writeFile(p, JSON.stringify(marker), { mode: 0o600 });
    const snapshot = vi
      .fn()
      .mockResolvedValueOnce([{ ...root, pid: 122 }])
      .mockResolvedValue([]);
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
    expect(JSON.parse(await readFile(p, 'utf8'))).toEqual(marker);
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(true);
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
    for (const value of [
      null,
      {},
      { guardPid: 0, browser: root },
      { guardPid: 122, browser: { ...root, pgid: 1 } },
      { guardPid: 122, browser: { ...root, ppid: 1 } },
      { guardPid: 122, browser: { ...root, birth: '' } },
      { guardPid: 122, browser: { ...root, crashDir: 'other' } },
    ]) {
      await writeFile(p, JSON.stringify(value), { mode: 0o600 });
      expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
    }
    await rm(p);
    await symlink(join(dir, 'target'), p);
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('공개 쓰기 가능하거나 크기가 큰 기록은 프로세스 검사 전에 차단한다', async () => {
  const { chmod, mkdir } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'oy-unsafe-startup-'));
  const p = join(dir, 'owner.json');
  const snapshot = vi.fn();
  try {
    await mkdir(p);
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
    await rm(p, { recursive: true });
    await writeFile(p, ' '.repeat(16385), { mode: 0o600 });
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
    await writeFile(p, '{}');
    await chmod(p, 0o666);
    expect(await recoverAbandonedGuard(p, Date.now() + 5000, snapshot)).toBe(false);
    expect(snapshot).not.toHaveBeenCalled();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
