import { expect, it, vi } from 'vitest';
import { createOliveyoungRelay } from '../../scripts/relay/oliveyoung.js';
let consumerSequence = 0;
const consumerHeaders = () => ({ 'x-relay-consumer': (++consumerSequence).toString(16).padStart(64, '0') });
const payload = { goodsNo: 'A1' };
const request = (path = 'stock-goods-info-v3', body = JSON.stringify(payload), token = 'test') =>
  new Request(`http://localhost/v1/oliveyoung/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...consumerHeaders() },
    body,
  });
it('원본 429는 작업별 대기 동안 새 요청과 대기열의 한도 소비를 막는다', async () => {
  const { BrowserRequestError } = await import('../../scripts/relay/browser.js');
  let fail!: (error: Error) => void;
  const run = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; })).mockResolvedValue({ status: 'SUCCESS' });
  const takeQuota = vi.fn(async () => true);
  const onEvent = vi.fn();
  const relay = createOliveyoungRelay('test', run, { takeQuota, onEvent });
  const first = relay(request());
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  const queued = relay(request(undefined, JSON.stringify({ goodsNo: 'A2' })));
  await vi.waitFor(() => expect(onEvent.mock.calls.filter(([event]) => event.stage === 'cache')).toHaveLength(2));
  fail(new BrowserRequestError('http-429', 429, 2));
  for (const response of await Promise.all([first, queued])) {
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
    expect(response.headers.get('x-relay-quota-reason')).toBeNull();
    expect(await response.json()).toMatchObject({ code: 'OLIVEYOUNG_UPSTREAM_RATE_LIMITED', upstreamStatus: 429, retryAfter: 2 });
  }
  expect((await relay(request())).status).toBe(429);
  expect(run).toHaveBeenCalledTimes(1); expect(takeQuota).toHaveBeenCalledTimes(1);
  const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 2100);
  try { expect((await relay(request())).status).toBe(200); } finally { clock.mockRestore(); }
  expect(run).toHaveBeenCalledTimes(2);
});
it('원본 대기 중 정상 캐시는 유지하고 fresh 실패와 로컬 기본 대기 정책을 구분한다', async () => {
  const { BrowserRequestError } = await import('../../scripts/relay/browser.js');
  const run = vi.fn().mockResolvedValueOnce({ status: 'SUCCESS' }).mockRejectedValueOnce(new BrowserRequestError('http-429', 429));
  const relay = createOliveyoungRelay('test', run);
  expect((await relay(request())).status).toBe(200);
  const fresh = () => { const req = request(); req.headers.set('x-relay-cache-bypass', 'true'); return req; };
  const limited = await relay(fresh());
  expect(await limited.json()).toMatchObject({ retryAfter: 60, retryAfterSource: 'local-policy' });
  expect((await relay(request())).headers.get('x-relay-cache')).toBe('hit');
  expect((await relay(fresh())).status).toBe(429);
  expect((await relay(request('product-search-v3', JSON.stringify({ includeSoldOut: true, keyword: '팩', page: 1, sort: '', size: 1 })))).status).toBe(502);
  expect(run).toHaveBeenCalledTimes(3);
});
