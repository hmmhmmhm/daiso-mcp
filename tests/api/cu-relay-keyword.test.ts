import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { fetchCuStores } from '../../src/services/cu/client.js';
const env = {
  CONVENIENCE_RELAY_URL: 'https://relay.example',
  CONVENIENCE_RELAY_TOKEN: 'token',
  KAKAO_REST_API_KEY: 'test-key',
};
const html = `<table><tr><td><span class="name">강남예시점</span></td><td><address><a href="#" onclick="searchLatLng('서울특별시 강남구 테헤란로4길 6, 강남역센트럴푸르지오시티 (역삼동) B1층 110호', 'sample');">서울특별시 강남구 테헤란로4길 6, 강남역센트럴푸르지오시티 (역삼동) B1층 110호</a></address></td></tr></table>`;
afterEach(() => vi.unstubAllGlobals());
function prepare(geocode = true) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://cu.bgfretail.com/store/list_Ajax.do?')) return new Response(html);
    if (url.startsWith('https://dapi.kakao.com/'))
      return Response.json({
        documents: geocode
          ? [{ x: '127.03', y: '37.5', address_name: '서울 강남구 테헤란로4길 6' }]
          : [],
      });
    if (url.endsWith('/cu-prime')) return Response.json({});
    if (url.endsWith('/cu-stock'))
      return Response.json({
        data: {
          stockResult: {
            result: { rows: [{ fields: { item_cd: '123', on_item_no: '456', item_nm: '레쓰비' } }] },
          },
        },
      });
    if (url.endsWith('/cu-store')) {
      const body = JSON.parse(init!.body as string);
      return Response.json({
        storeList:
          body.latVal === '37.5'
            ? [{ storeCd: 'sample', storeNm: '강남예시점', stock: 48 }]
            : [
                {
                  storeCd: 'wrong',
                  storeNm: '시청예시점',
                  stock: 0,
                  doroStoreAddr1: '서울 중구 세종대로 1',
                },
              ],
      });
    }
    throw Error('Unexpected endpoint');
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
it('중계 설정이 있어도 좌표 없는 CU 매장 키워드는 공식 웹에서 찾는다', async () => {
  const fetcher = prepare();
  const result = await fetchCuStores(
    { searchWord: '강남' },
    {
      convenienceRelayUrl: env.CONVENIENCE_RELAY_URL,
      convenienceRelayToken: env.CONVENIENCE_RELAY_TOKEN,
    },
  );
  expect(result.stores).toEqual([
    expect.objectContaining({
      storeName: '강남예시점',
      address: '서울특별시 강남구 테헤란로4길 6, 강남역센트럴푸르지오시티 (역삼동) B1층 110호',
      stock: null,
    }),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain('https://cu.bgfretail.com/store/list_Ajax.do?');
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('searchWord')).toBe('강남');
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET' });
});
it.each([true, false])(
  'REST와 MCP 키워드 재고는 요청 지역을 지키고 좌표 미확인 수량을 추정하지 않는다 (%s)',
  async (geocode) => {
    const fetcher = prepare(geocode);
    const response = await app.request(
      '/api/cu/inventory?keyword=레쓰비&storeKeyword=강남역&size=1&storeLimit=1',
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    const rest = await response.json();
    expect(rest.data.location).toEqual(geocode ? { latitude: 37.5, longitude: 127.03 } : null);
    expect(rest.data.nearbyStores.stores).toEqual([
      expect.objectContaining({ storeName: '강남예시점', stock: geocode ? 48 : null }),
    ]);
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), {
        fetch: async (url, init) => app.request(new Request(url, init), undefined, env),
      }),
    );
    try {
      const result = await client.callTool({
        name: 'cu_check_inventory',
        arguments: { keyword: '레쓰비', storeKeyword: '강남역', size: 1, storeLimit: 1 },
      });
      expect(result.isError).not.toBe(true);
      const content = result.content as Array<{ text: string }>;
      expect(JSON.parse(content[0].text).location).toEqual(geocode ? { latitude: 37.5, longitude: 127.03 } : null);
      expect(JSON.parse(content[0].text).nearbyStores.stores).toEqual([
        expect.objectContaining({ storeName: '강남예시점', stock: geocode ? 48 : null }),
      ]);
      const stockCalls = fetcher.mock.calls.filter(([url]) => url.endsWith('/cu-store'));
      expect(stockCalls).toHaveLength(geocode ? 2 : 0);
      for (const [, init] of stockCalls)
        expect(JSON.parse(init!.body as string)).toMatchObject({
          latVal: '37.5',
          longVal: '127.03',
          searchWord: '강남역',
          itemCd: '123',
          onItemNo: '456',
          isRecommend: 'Y',
          recommendId: 'stock',
        });
    } finally {
      await client.close();
    }
  },
);
it.each([
  ['/api/cu/stores?keyword=강남', 'cu-stores', 86400, 300],
  ['/api/cu/inventory?keyword=레쓰비&storeKeyword=강남역', 'cu-inventory', 600, 60],
])(
  'CU 수정 후 일반 사용자 URL의 기존 잘못된 캐시를 우회한다 (%s)',
  async (path, prefix, ttl, swr) => {
    const fetcher = prepare();
    const url = new URL(path as string, 'https://local.test');
    const oldKey = new URL(url);
    oldKey.searchParams.append('__cache_prefix', `${prefix}-v4`);
    const entries = new Map<string, Response>([
      [oldKey.href, Response.json({ success: true, data: { storeName: '시청예시점', stock: 0 } })],
    ]);
    const match = vi.fn(async (key: Request) => entries.get(key.url)?.clone());
    const put = vi.fn(async (key: Request, response: Response) => {
      entries.set(key.url, response.clone());
    });
    vi.stubGlobal('caches', { default: { match, put } });
    const response = await app.request(url.href, undefined, env);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('강남예시점');
    expect(text).not.toContain('시청예시점');
    const newKey = new URL(url);
    newKey.searchParams.append('__cache_prefix', `${prefix}-v5`);
    expect(match.mock.calls[0][0].url).toBe(newKey.href);
    expect(put.mock.calls[0][0].url).toBe(newKey.href);
    expect(response.headers.get('Cache-Control')).toContain(`max-age=${ttl}`);
    expect(response.headers.get('Cache-Control')).toContain(`stale-while-revalidate=${swr}`);
    const calls = fetcher.mock.calls.length;
    expect(await (await app.request(url.href, undefined, env)).text()).toBe(text);
    expect(fetcher.mock.calls).toHaveLength(calls);
    expect(entries.has(oldKey.href)).toBe(true);
  },
);
