import { expect, it } from 'vitest';
import { createConsumerQuota } from '../../scripts/relay/consumer.js';
it('동시 요청과 분당 신규 작업을 제한하고 만료 예산만 정리한다', () => {
  let now = 0;
  const quota = createConsumerQuota(() => now, 2);
  const a = quota.enter('a')!;
  const take = () => { const reservation = a.reserve(); if (!reservation) return false; reservation.commit(); reservation.release(); return true; };
  const b = quota.enter('a')!;
  expect(quota.enter('a')).toBeNull();
  expect(take()).toBe(true);
  b.release();
  for (let i = 1; i < 240; i++) expect(take()).toBe(true);
  expect(take()).toBe(false);
  expect(quota.retryAfter()).toBe(60);
  const other = quota.enter('b')!;
  other.release();
  expect(quota.enter('c')).toBeNull();
  now = 60000;
  expect(quota.enter('c')).not.toBeNull();
  expect(take()).toBe(true);
  a.release();
  now = 120000;
  expect(quota.enter('d')).not.toBeNull();
});
it('대기 예약을 상한에 포함하고 분이 바뀌면 실행 시점의 예산으로 확정한다', () => {
  let now = 0;
  const quota = createConsumerQuota(() => now);
  const admission = quota.enter('a')!;
  for (let i = 0; i < 239; i++) { const reservation = admission.reserve()!; reservation.commit(); reservation.release(); }
  const queued = admission.reserve()!;
  expect(admission.reserve()).toBeNull();
  now = 60000;
  queued.commit();
  queued.release();
  const canceled = admission.reserve()!;
  canceled.release();
  for (let i = 0; i < 239; i++) { const reservation = admission.reserve()!; reservation.commit(); reservation.release(); }
  expect(admission.reserve()).toBeNull();
  admission.release();
});
