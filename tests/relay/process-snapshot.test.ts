/** POSIX 명령 호출과 결과 변환은 Windows에서도 검증합니다. */
import { expect, it, vi } from 'vitest';

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile }));

import { processSnapshot } from '../../scripts/relay/ownership.js';

it('ps 명령의 제한 시간을 적용하고 메모리와 프로세스 정체를 읽는다', async () => {
  execFile.mockImplementation((_file, _args, _options, callback) => {
    callback(null, {
      stdout: '100 1 100 200 Mon Sep 15 09:00:00 2026 Chrome',
    });
  });
  expect(await processSnapshot()).toEqual([
    { pid: 100, ppid: 1, pgid: 100, rss: 204800, birth: 'Mon Sep 15 09:00:00 2026', command: 'Chrome' },
  ]);
  expect(execFile).toHaveBeenCalledWith(
    '/bin/ps',
    ['-axo', 'pid=,ppid=,pgid=,rss=,lstart=,command='],
    { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
    expect.any(Function),
  );
});
