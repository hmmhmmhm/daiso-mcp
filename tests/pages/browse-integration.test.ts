import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { nextKstMidnightEpochSeconds, toKstDay } from '../../src/durableObjects/dailyRateLimiter.js';

afterEach(() => vi.unstubAllGlobals());
it('실제 상품 API와 같은 상품·필터를 사용하고 외부 호출을 중복하지 않는다', async () => {
  const fetcher = vi.fn(async () => Response.json({ resultSet: { result: [{ totalSize: 2, resultDocuments: [
    { PD_NO: '105603886', PDNM: '핫식스', PD_PRC: '1000', SOLD_OUT_YN: 'N' },
  ] }] } }));
  vi.stubGlobal('fetch', fetcher);
  const res = await app.request('/browse/daiso/products/핫식스/pageSize/1', { headers: { Accept: 'application/json' } });
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/html');
  expect(await res.text()).toContain('105603886');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const raw = await app.request('/api/daiso/products?q=핫식스&pageSize=1');
  expect(raw.headers.get('Content-Type')).toContain('application/json');
  expect((await raw.json()).data.products[0].id).toBe('105603886');
});
it.each([true, false])('기존 일일 한도와 CF 신원을 한 번 적용하고 보호 응답을 보존한다: %s', async (allowed) => {
  const now = Date.now();
  const quota = vi.fn(async (url: string) => url.endsWith('/blocked-events') ? new Response(null, { status: 204 }) : Response.json({ allowed, count: allowed ? 1 : 3000, remaining: allowed ? 2999 : 0, day: toKstDay(now), resetAt: nextKstMidnightEpochSeconds(now) }));
  const names: string[] = [];
  const env = { DAILY_RATE_LIMITER: { idFromName: (name: string) => { names.push(name); return { toString: () => 'a'.repeat(64) }; }, get: () => ({ fetch: quota }) } };
  const res = await app.request('/browse/gs25/products', { headers: { 'CF-Connecting-IP': '192.0.2.15' } }, env);
  expect(res.status).toBe(allowed ? 400 : 429);
  expect(res.headers.get('Content-Type')).toContain('text/html');
  expect(res.headers.get('X-RateLimit-Remaining')).toBe(allowed ? '2999' : '0');
  expect(quota.mock.calls.filter(([url]) => url.endsWith('/consume'))).toHaveLength(1);
  expect(names[0]).not.toContain('192.0.2.15');
  if (!allowed) {
    expect(res.headers.get('Retry-After')).not.toBeNull();
    expect(await res.text()).toContain('DAILY_RATE_LIMIT_EXCEEDED');
  }
});
