import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
const env = {
  CONVENIENCE_RELAY_URL: 'https://relay.example',
  CONVENIENCE_RELAY_TOKEN: 'token',
  HEALTH_CHECK_SECRET: 'health',
};
const fixture = (url: string) => {
  const op = url.split('/').at(-1);
  if (op === 'emart24-products')
    return { totalCnt: 1, productList: [{ pluCd: '123', goodsNm: '커피', viewPrice: 2800 }] };
  if (op === 'emart24-stores')
    return {
      error: 0,
      count: 2,
      data: [
        { CODE: '00940', TITLE: '청담하나점' },
        { CODE: '02130', TITLE: '강남역점' },
      ],
    };
  if (op === 'emart24-stock')
    return {
      storeGoodsInfo: { pluCd: '123' },
      storeGoodsQty: [{ BIZNO: '00940', BIZQTY: '0' }, { BIZNO: '02130' }],
    };
  if (op === 'emart24-store-detail') return { storeInfo: { storeNm: '강남매장' } };
  throw Error(`unexpected direct request ${url}`);
};
afterEach(() => vi.unstubAllGlobals());
it('REST·MCP·비교의 이마트24 조회는 같은 중계 바인딩을 사용한다', async () => {
  const fetcher = vi.fn(async (url: string) => Response.json(fixture(url)));
  vi.stubGlobal('fetch', fetcher);
  for (const path of [
    '/api/emart24/products?keyword=커피',
    '/api/emart24/stores?keyword=강남',
    '/api/emart24/inventory?keyword=커피&storeKeyword=강남',
    '/api/compare/products?keyword=커피&services=emart24',
  ]) {
    const response = await app.request(path, undefined, env);
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  }
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), {
      fetch: async (url, init) => app.request(new Request(url, init), undefined, env),
    }),
  );
  try {
    for (const [name, args] of [
      ['emart24_search_products', { keyword: '커피' }],
      ['emart24_find_nearby_stores', { keyword: '강남' }],
      ['emart24_check_inventory', { keyword: '커피', storeKeyword: '강남' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).not.toContain('degraded');
    }
    expect(
      fetcher.mock.calls.every(([url]) =>
        url.startsWith('https://relay.example/v1/convenience/emart24-'),
      ),
    ).toBe(true);
  } finally {
    await client.close();
  }
});
it('인증된 새 조회만 엣지와 모든 재고 단계의 중계 캐시를 우회한다', async () => {
  const fetcher = vi.fn(async (url: string) => Response.json(fixture(url)));
  const cache = {
    match: vi.fn(async () => Response.json({ success: true, data: { cached: true } })),
    put: vi.fn(),
  };
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('caches', { default: cache });
  const response = await app.request(
    '/api/emart24/inventory?keyword=커피&storeKeyword=강남',
    { headers: { 'x-health-check-force-fresh': 'true', Authorization: 'Bearer health' } },
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const data = await response.json();
  expect(data.data.stores.map((store: { bizQty: unknown }) => store.bizQty)).toEqual([0, null]);
  expect(cache.match).not.toHaveBeenCalled();
  expect(cache.put).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(5);
  for (const [, init] of fetcher.mock.calls as unknown as [string, RequestInit][])
    expect(init.headers).toEqual(expect.objectContaining({ 'x-relay-cache-bypass': 'true' }));
  const compared = await app.request(
    '/api/compare/products?keyword=커피&services=emart24',
    { headers: { 'x-health-check-force-fresh': 'true', Authorization: 'Bearer health' } },
    env,
  );
  expect(compared.headers.get('cache-control')).toBe('no-store');
  expect(cache.match).not.toHaveBeenCalled();
  expect((fetcher.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers).toEqual(
    expect.objectContaining({ 'x-relay-cache-bypass': 'true' }),
  );
  await app.request(
    '/api/emart24/products?keyword=커피',
    { headers: { 'x-health-check-force-fresh': 'true', Authorization: 'Bearer wrong' } },
    env,
  );
  expect(cache.match).toHaveBeenCalledTimes(1);
  await app.request(
    '/api/compare/products?keyword=커피&services=emart24',
    { headers: { 'x-health-check-force-fresh': 'true', Authorization: 'Bearer wrong' } },
    env,
  );
  expect(cache.match).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenCalledTimes(6);
});
