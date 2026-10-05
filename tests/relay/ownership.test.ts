import { expect, it, vi } from 'vitest';
import { parseProcesses, ownedGroup, closeOwnedGroup } from '../../scripts/relay/ownership.js';
const root = { pid: 100, ppid: 1, pgid: 100, rss: 200, birth: 'Mon Sep 15 09:00:00 2026' };
const child = { ...root, pid: 101, ppid: 100, rss: 300 };
it('프로세스 그룹의 전체RSS를 조회하고 PID 재사용을 거절한다', () => {
  const rows = parseProcesses(
    ' 100 1 100 200 Mon Sep 15 09:00:00 2026 Chrome\n 101 100 100 300 Mon Sep 15 09:00:00 2026 Renderer',
  );
  expect(ownedGroup(root, rows).reduce((sum, p) => sum + p.rss, 0)).toBe(500 * 1024);
  expect(() => ownedGroup(root, [{ ...root, birth: 'different' }])).toThrow('identity');
});
it('정상 종료 이후 남은 소유 그룹만 강제 종료하고 소멸을 확인한다', async () => {
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root, child])
    .mockResolvedValueOnce([child])
    .mockResolvedValue([]);
  const kill = vi.fn();
  await closeOwnedGroup(root, async () => {}, snapshot, kill);
  expect(kill).toHaveBeenCalledWith(-100, 'SIGKILL');
});
it('원래 그룹의 정체를 확인할 수 없으면 강제 종료하지 않는다', async () => {
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root])
    .mockResolvedValueOnce([{ ...child, birth: 'new' }]);
  const kill = vi.fn();
  await expect(closeOwnedGroup(root, async () => {}, snapshot, kill)).rejects.toThrow('identity');
  expect(kill).not.toHaveBeenCalled();
});
it.skipIf(process.platform === 'win32')(
  '실제 POSIX 스냅샷에서 현재 프로세스를 찾는다',
  async () => {
    const { processSnapshot } = await import('../../scripts/relay/ownership.js');
    expect((await processSnapshot()).some((row) => row.pid === process.pid)).toBe(true);
  },
);
it('잘못된 형식과 이미 사라진 그룹을 처리한다', async () => {
  expect(() => parseProcesses('bad')).toThrow('Invalid');
  const close = vi.fn().mockResolvedValue(undefined);
  await closeOwnedGroup(root, close, async () => [], vi.fn());
  expect(close).toHaveBeenCalledTimes(1);
});
it('강제 종료 후에도 남은 프로세스는 확인 실패로 처리한다', async () => {
  vi.useFakeTimers();
  const snapshot = vi.fn().mockResolvedValue([root]);
  const pending = closeOwnedGroup(
    root,
    async () => {
      throw new Error('close');
    },
    snapshot,
    vi.fn(),
  );
  const rejected = expect(pending).rejects.toThrow('still alive');
  await vi.advanceTimersByTimeAsync(3000);
  await rejected;
  vi.useRealTimers();
});
it('분리된 Crashpad는 정확한 전용 디렉터리로만 포함하고 회수한다', async () => {
  const owned = { ...root, crashDir: '/owned-uuid' };
  const helper = {
    ...child,
    pid: 201,
    pgid: 200,
    command: 'chrome_crashpad_handler --database=/owned-uuid --other',
  };
  const personal = {
    ...helper,
    pid: 301,
    pgid: 300,
    command: 'chrome_crashpad_handler --database=/owned-uuid-other',
  };
  expect(ownedGroup(owned, [root, helper, personal]).map((p) => p.pid)).toEqual([100, 201]);
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root, helper, personal])
    .mockResolvedValueOnce([helper, personal])
    .mockResolvedValue([personal]);
  const kill = vi.fn();
  await closeOwnedGroup(owned, async () => {}, snapshot, kill);
  expect(kill).toHaveBeenCalledExactlyOnceWith(201, 'SIGKILL');
  const trailing = { ...helper, command: 'chrome_crashpad_handler --database=/owned-uuid' };
  expect(ownedGroup(owned, [root, trailing])).toHaveLength(2);
});
it('종료 중 이미 사라진 PID만 허용하고 그 외 kill 오류는 보존한다', async () => {
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root])
    .mockResolvedValueOnce([root])
    .mockResolvedValue([]);
  await closeOwnedGroup(
    root,
    async () => {},
    snapshot,
    () => {
      throw Object.assign(new Error(), { code: 'ESRCH' });
    },
  );
  await expect(
    closeOwnedGroup(
      root,
      async () => {},
      async () => [root],
      () => {
        throw new Error('denied');
      },
    ),
  ).rejects.toThrow('denied');
});
it('소유 Crashpad가 남아 있어도 재사용된 다른 프로세스 그룹은 종료하지 않는다', async () => {
  const owned = { ...root, crashDir: '/uuid' };
  const helper = {
    ...child,
    pid: 201,
    pgid: 200,
    command: 'chrome_crashpad_handler --database=/uuid',
  };
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root, helper])
    .mockResolvedValueOnce([{ ...root, birth: 'reused' }, helper])
    .mockResolvedValue([]);
  const kill = vi.fn();
  await expect(closeOwnedGroup(owned, async () => {}, snapshot, kill)).rejects.toThrow('identity');
  expect(kill).not.toHaveBeenCalled();
});
it('Crashpad PID가 재사용되면 이름과 디렉터리가 같아도 종료하지 않는다', async () => {
  const owned = { ...root, crashDir: '/uuid' };
  const helper = {
    ...child,
    pid: 201,
    pgid: 200,
    command: 'chrome_crashpad_handler --database=/uuid',
  };
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root, helper])
    .mockResolvedValueOnce([{ ...helper, birth: 'new' }]);
  const kill = vi.fn();
  await expect(closeOwnedGroup(owned, async () => {}, snapshot, kill)).rejects.toThrow('identity');
  expect(kill).not.toHaveBeenCalled();
});
it('강제 종료 후에도 Playwright 프로필 정리 완료를 기다린다', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const closing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const snapshot = vi
    .fn()
    .mockResolvedValueOnce([root])
    .mockResolvedValueOnce([root])
    .mockResolvedValue([]);
  let done = false;
  const pending = closeOwnedGroup(
    root,
    () => closing,
    snapshot,
    () => {},
  ).then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect(done).toBe(false);
  finish();
  await pending;
  vi.useRealTimers();
});
it('프로세스 소멸이 확인되면 Playwright 종료 거절은 복구를 막지 않는다', async () => {
  const kill = vi.fn();
  await expect(
    closeOwnedGroup(
      root,
      async () => {
        throw Error('Target closed');
      },
      async () => [],
      kill,
    ),
  ).resolves.toBeUndefined();
  expect(kill).not.toHaveBeenCalled();
});
it('느린 close와 강제 종료 확인 및 프로필 정리도 한 예산 안에 끝낸다', async () => {
  vi.useFakeTimers();
  const started = Date.now();
  const snapshot = vi
    .fn()
    .mockImplementation(async () => (Date.now() - started < 5900 ? [root] : []));
  const closing = new Promise<void>((resolve) => setTimeout(resolve, 6900));
  const pending = closeOwnedGroup(root, () => closing, snapshot, vi.fn());
  await vi.advanceTimersByTimeAsync(7000);
  await expect(pending).resolves.toBeUndefined();
  expect(Date.now() - started).toBe(7000);
  vi.useRealTimers();
});

it('공유 종료 기한을 넘긴 프로필 정리는 실패로 남긴다', async () => {
  vi.useFakeTimers();
  const started = Date.now();
  const snapshot = vi
    .fn()
    .mockImplementation(async () => (Date.now() - started < 5900 ? [root] : []));
  const closing = new Promise<void>((resolve) => setTimeout(resolve, 6900));
  const pending = closeOwnedGroup(root, () => closing, snapshot, vi.fn(), started + 6500);
  const rejected = expect(pending).rejects.toThrow('watchdog');
  await vi.advanceTimersByTimeAsync(7000);
  await rejected;
  vi.useRealTimers();
});
it('정상 종료 또는 강제 종료 후 소멸이 확인되어도 close 거절을 허용한다', async () => {
  for (const snapshots of [
    [[root], []],
    [[root], [root], []],
  ]) {
    const snapshot = vi.fn();
    for (const rows of snapshots) snapshot.mockResolvedValueOnce(rows);
    const kill = vi.fn();
    await expect(
      closeOwnedGroup(
        root,
        async () => {
          throw Error('Target closed');
        },
        snapshot,
        kill,
      ),
    ).resolves.toBeUndefined();
    expect(kill).toHaveBeenCalledTimes(snapshots.length === 3 ? 1 : 0);
  }
});
it('스냅샷 실패를 소멸로 간주하거나 임의 프로세스를 종료하지 않는다', async () => {
  const kill = vi.fn();
  await expect(
    closeOwnedGroup(
      root,
      async () => {},
      async () => {
        throw Error('snapshot denied');
      },
      kill,
    ),
  ).rejects.toThrow('snapshot denied');
  expect(kill).not.toHaveBeenCalled();
});
