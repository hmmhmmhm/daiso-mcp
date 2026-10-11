import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { __testOnlyClearOliveyoungCaches } from '../../src/services/oliveyoung/client.js';
const bindings = {
  HEALTH_CHECK_SECRET: 'test-secret',
  OY_RELAY_URL: 'https://relay.example',
  OY_RELAY_TOKEN: 'trusted-token',
};
beforeEach(() => __testOnlyClearOliveyoungCaches());
afterEach(() => vi.unstubAllGlobals());
it.each([
  'products?keyword=fresh',
  'stores?keyword=fresh',
  'inventory?keyword=fresh&stockCheckLimit=0',
])('authenticated fresh %s forwards relay bypass', async (route) => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: 'SUCCESS', data: {} }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    (
      await app.request(
        '/api/oliveyoung/' + route,
        { headers: { Authorization: 'Bearer test-secret', 'x-health-check-force-fresh': 'true' } },
        bindings,
      )
    ).status,
  ).toBe(200);
  expect(fetcher.mock.calls.length).toBeGreaterThan(0);
  for (const [, options] of fetcher.mock.calls)
    expect(options.headers).toMatchObject({ 'x-relay-cache-bypass': 'true' });
});
it('unauthenticated fresh flags do not forward relay cache bypass', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: 'SUCCESS', data: {} }));
  vi.stubGlobal('fetch', fetcher);
  await app.request(
    '/api/oliveyoung/products?keyword=untrusted',
    { headers: { 'x-health-check-force-fresh': 'true' } },
    bindings,
  );
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('x-relay-cache-bypass');
});
it('authenticated fresh product search reports upstream failure after warming stale data', async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(async () =>
      Response.json({
        status: 'SUCCESS',
        data: { totalCount: 1, serachList: [{ goodsNumber: 'A1' }] },
      }),
    )
    .mockImplementation(async () => new Response('blocked', { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    (await app.request('/api/oliveyoung/products?keyword=stale-proof', undefined, bindings)).status,
  ).toBe(200);
  const response = await app.request(
    '/api/oliveyoung/products?keyword=stale-proof',
    { headers: { Authorization: 'Bearer test-secret', 'x-health-check-force-fresh': 'true' } },
    bindings,
  );
  expect(response.status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
