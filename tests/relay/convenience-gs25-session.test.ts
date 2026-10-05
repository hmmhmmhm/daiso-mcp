import { expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
import { RelayError } from '../../scripts/relay/http-relay.js';

const request = () => new Request('http://localhost/v1/convenience/gs25-stock', {
  method: 'POST', headers: { Authorization: 'Bearer convenience' },
  body: JSON.stringify({ serviceCode: '01', realTimeStockYn: 'Y', itemCode: '1' }),
});
it('세션 전송이 있으면 Worker API키 없이 재고를 조회한다', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const session = vi.fn(async () => Response.json({ stores: [{ realStockQuantity: '16' }] }));
  const quota = vi.fn(async () => true);
  const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: quota, gs25Session: session });
  expect((await relay(request())).status).toBe(200);
  expect((await relay(request())).status).toBe(200);
  expect(fetcher).not.toHaveBeenCalled();
  expect(session).toHaveBeenCalledTimes(1);
  expect(quota).toHaveBeenCalledTimes(1);
});
it('세션 갱신 오류는 캐시하거나 재고0으로 바꾸지 않는다', async () => {
  const session = vi.fn(async () => { throw new RelayError(403); });
  const relay = createConvenienceRelay('convenience', { takeQuota: async () => true, gs25Session: session });
  expect((await relay(request())).status).toBe(403);
  expect((await relay(request())).status).toBe(403);
  expect(session).toHaveBeenCalledTimes(2);
});
