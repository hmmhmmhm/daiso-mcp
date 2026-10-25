import { expect, it, vi } from 'vitest';
import { createRelayWatchdog } from '../../scripts/relay/watchdog.js';
it('정상·작업 중·종료 상태에서는 복구하거나 원본을 조회하지 않는다', async () => {
  const start = vi.fn();
  let state = 'ready';
  let active = false;
  const tick = createRelayWatchdog({ start, status: () => ({ state, active }) });
  for (state of ['ready', 'starting', 'closed']) await tick();
  state = 'failed';
  active = true;
  await tick();
  expect(start).not.toHaveBeenCalled();
});
it('실패한 중계의 복구를 공유하고 실패 시 최대15분까지 대기한다', async () => {
  let now = 0;
  let finish!: () => void;
  const start = vi.fn().mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  const event = vi.fn();
  const tick = createRelayWatchdog(
    { start, status: () => ({ state: 'failed', active: false }) },
    event,
    () => now,
  );
  const first = tick();
  const same = tick();
  expect(start).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([first, same]);
  start.mockRejectedValue(new Error('secret must not be logged'));
  for (const wait of [60000, 60000, 120000, 240000, 480000, 900000]) {
    now += wait;
    await tick();
    const count = start.mock.calls.length;
    await tick();
    expect(start).toHaveBeenCalledTimes(count);
  }
  expect(event.mock.calls.flat().join(' ')).not.toContain('secret');
  expect(event).toHaveBeenCalledWith('recovery-failed');
});
it('상태가 정상으로 돌아오면 실패 대기를 해제한다', async () => {
  let state = 'idle';
  let now = 0;
  const start = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(undefined);
  const tick = createRelayWatchdog(
    { start, status: () => ({ state, active: false }) },
    undefined,
    () => now,
  );
  await tick();
  state = 'ready';
  await tick();
  state = 'idle';
  now = 1;
  await tick();
  expect(start).toHaveBeenCalledTimes(2);
});
