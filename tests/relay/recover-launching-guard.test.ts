import { mkdtemp, writeFile, rm, readdir, stat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { recoverAbandonedGuard } from '../../scripts/relay/recover-abandoned-guard.js';
import {
  recoverLaunchingGuard,
  processReferencesDirectory,
  environmentSnapshotArgs,
} from '../../scripts/relay/recover-launching-guard.js';
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});
async function fixture(change: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'launch-recovery-'));
  dirs.push(dir);
  const marker = join(dir, 'owner.json');
  const value = {
    guardPid: 12345,
    state: 'launching',
    crashDir: marker + '.' + randomUUID() + '.crashpad',
    ...change,
  };
  const raw = JSON.stringify(value);
  await writeFile(marker, raw, { mode: 0o600 });
  return { dir, marker, value, raw };
}
it('시작 실패 마커는 감시자와 환경 태그의 소멸을 두 번 확인한 뒤 보존한다', async () => {
  const f = await fixture();
  const snapshot = vi.fn().mockResolvedValue([]);
  const references = vi.fn().mockResolvedValue(false);
  expect(await recoverAbandonedGuard(f.marker, Date.now() + 5000, snapshot, references)).toBe(true);
  expect(snapshot).toHaveBeenCalledTimes(2);
  expect(references).toHaveBeenCalledTimes(2);
  expect((await readdir(f.dir)).filter((x) => x.startsWith('owner.json.exited-'))).toHaveLength(1);
});
it('실제 프로세스 및 환경 관측으로도 존재하지 않는 감시자 기록만 회수한다', async () => {
  const f = await fixture({ guardPid: 99999999 });
  expect(await recoverAbandonedGuard(f.marker, Date.now() + 10000)).toBe(true);
});
it.each([
  { guardPid: 0 },
  { guardPid: 'bad' },
  { guardPid: 1.5 },
  { crashDir: undefined },
  { crashDir: '/other/file.crashpad' },
  { crashDir: 'bad' },
])('불완전한 시작 기록은 거절한다 %j', async (change) => {
  const f = await fixture(change);
  expect(
    await recoverAbandonedGuard(
      f.marker,
      Date.now() + 5000,
      async () => [],
      async () => false,
    ),
  ).toBe(false);
});
it('다른 마커 이름과 UUID가 없는 경로를 거절한다', async () => {
  for (const suffix of ['other.' + randomUUID() + '.crashpad', 'owner.json.not-uuid.crashpad']) {
    const f = await fixture();
    await writeFile(f.marker, JSON.stringify({ ...f.value, crashDir: join(f.dir, suffix) }));
    expect(
      await recoverAbandonedGuard(
        f.marker,
        Date.now() + 5000,
        async () => [],
        async () => false,
      ),
    ).toBe(false);
  }
});
it('브라우저 정체가 있는 기록은 기존의 더 엄격한 회수 절차를 유지한다', async () => {
  const f = await fixture({ browser: {} });
  expect(
    await recoverAbandonedGuard(
      f.marker,
      Date.now() + 5000,
      async () => [],
      async () => false,
    ),
  ).toBe(false);
});
it('살아 있는 감시자·명령 인수·환경 태그는 어느 관측에서든 회수를 막는다', async () => {
  const row = { pid: 99, ppid: 1, pgid: 99, rss: 0, birth: 'birth', command: 'node' };
  for (const kind of ['guard', 'command', 'tag', 'second-tag', 'unrelated']) {
    const f = await fixture();
    const rows =
      kind === 'guard'
        ? [{ ...row, pid: f.value.guardPid }]
        : kind === 'command'
          ? [{ ...row, command: f.value.crashDir }]
          : [{ ...row, command: kind === 'unrelated' ? undefined : 'node' }];
    const references = vi.fn().mockResolvedValue(kind === 'tag');
    if (kind === 'second-tag') references.mockResolvedValueOnce(false).mockResolvedValue(true);
    expect(
      await recoverAbandonedGuard(f.marker, Date.now() + 5000, async () => rows, references),
    ).toBe(kind === 'unrelated');
  }
});
it('파일 정체가 바뀌거나 내용이 수정되면 보존 이동을 거절한다', async () => {
  for (const kind of ['content', 'size', 'inode']) {
    const f = await fixture();
    let count = 0;
    const refs = async () => {
      if (++count === 2) {
        if (kind === 'content') await writeFile(f.marker, f.raw.replace('12345', '54321'));
        else if (kind === 'size') await writeFile(f.marker, f.raw + ' ');
        else {
          await writeFile(f.marker + '.new', f.raw, { mode: 0o600 });
          await rename(f.marker + '.new', f.marker);
        }
      }
      return false;
    };
    expect(await recoverAbandonedGuard(f.marker, Date.now() + 5000, async () => [], refs)).toBe(
      false,
    );
  }
});
it('열린 파일의 장치·inode가 기대와 다르면 프로세스 검사 전에 거절한다', async () => {
  const f = await fixture();
  const s = await stat(f.marker);
  for (const expected of [
    { dev: s.dev + 1, ino: s.ino },
    { dev: s.dev, ino: s.ino + 1 },
  ])
    expect(
      await recoverLaunchingGuard(
        f.marker,
        f.raw,
        expected,
        Date.now() + 5000,
        async () => [],
        async () => false,
      ),
    ).toBe(false);
});
it('불확실한 프로세스 관측과 기한 만료에는 기존 기록을 유지한다', async () => {
  const f = await fixture();
  expect(
    await recoverAbandonedGuard(
      f.marker,
      Date.now() + 5000,
      async () => {
        throw Error('unavailable');
      },
      async () => false,
    ),
  ).toBe(false);
  expect(
    await recoverAbandonedGuard(
      f.marker,
      Date.now() + 5000,
      async () => [],
      async () => {
        throw Error('unavailable');
      },
    ),
  ).toBe(false);
  vi.useFakeTimers();
  const deadline = Date.now() + 5000;
  let count = 0;
  expect(
    await recoverAbandonedGuard(
      f.marker,
      deadline,
      async () => [],
      async () => {
        if (++count === 2) vi.spyOn(Date, 'now').mockReturnValue(deadline + 1);
        return false;
      },
    ),
  ).toBe(false);
});
it('환경 원문을 반환하지 않고 태그·PID와 관측 완전성만 검사한다', async () => {
  for (const kind of ['clean', 'tag', 'guard', 'missing-self', 'missing-env']) {
    const capture = vi.fn(async (_args: string[], options: { env: NodeJS.ProcessEnv }) => ({
      stdout:
        (kind === 'missing-self' ? '' : `${process.pid} node\n`) +
        (kind === 'missing-env'
          ? ''
          : `999 /bin/ps DAISO_RECOVERY_SNAPSHOT=${options.env.DAISO_RECOVERY_SNAPSHOT}\n`) +
        (kind === 'guard'
          ? '12345 browser\n'
          : kind === 'tag'
            ? '55 browser BREAKPAD_DUMP_LOCATION=/private/owned.crashpad\n'
            : ''),
    }));
    const result = processReferencesDirectory(
      '/private/owned.crashpad',
      12345,
      Date.now() - 1,
      capture,
    );
    if (kind.startsWith('missing')) await expect(result).rejects.toThrow('Incomplete');
    else expect(await result).toBe(kind !== 'clean');
    expect(capture.mock.calls[0][1]).toMatchObject({ timeout: 1, maxBuffer: 16 * 1024 * 1024 });
  }
});

it('운영체제별 ps 환경 조회 인수를 명시한다', () => {
  expect(environmentSnapshotArgs('darwin', 501)).toEqual([
    '-Eww',
    '-U',
    '501',
    '-o',
    'pid=,command=',
  ]);
  expect(environmentSnapshotArgs('linux', 1000)).toEqual([
    'eww',
    '-U',
    '1000',
    '-o',
    'pid=,command=',
  ]);
});
it('명령 인수에는 없는 실제 자식의 환경 태그가 남으면 회수하지 않는다', async () => {
  const f = await fixture({ guardPid: 99999999 });
  const child = spawn(
    process.execPath,
    ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'],
    {
      env: { ...process.env, BREAKPAD_DUMP_LOCATION: f.value.crashDir },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const exited = once(child, 'exit');
  try {
    await once(child.stdout!, 'data');
    expect(await recoverAbandonedGuard(f.marker, Date.now() + 10000)).toBe(false);
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
  expect(await recoverAbandonedGuard(f.marker, Date.now() + 10000)).toBe(true);
}, 30000);
