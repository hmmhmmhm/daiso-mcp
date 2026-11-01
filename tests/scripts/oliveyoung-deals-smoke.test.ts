import { expect, it } from 'vitest';
import { validateOliveyoungTodayDeals } from '../../scripts/ops/mcp-smoke-validation.js';
const payload = () => ({
  date: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
  brandDeals: [{ goodsNo: 'A000000000001', name: '상품', price: 1000, soldOut: false }],
  todayDeals: [{ goodsNo: 'A000000000002', name: '상품2', price: 1000, soldOut: true }],
  truncated: false,
});
it('새 오특 기능도 한국 날짜·실제 가격·품절을 가진 두 목록을 필수 검사한다', () => {
  expect(validateOliveyoungTodayDeals(payload())).toBeNull();
  for (const patch of [
    { date: '2000-01-01' },
    { brandDeals: [] },
    { todayDeals: [] },
    { truncated: undefined },
    { todayDeals: [{ goodsNo: 'A000000000002', name: '상품2', price: 0, soldOut: false }] },
  ])
    expect(validateOliveyoungTodayDeals({ ...payload(), ...patch })).not.toBeNull();
});
