import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { clearSevenElevenReadCache } from '../../src/services/seveneleven/readCache.js';
const env = { CONVENIENCE_RELAY_URL: 'https://relay.example', CONVENIENCE_RELAY_TOKEN: 'token' };
afterEach(() => vi.unstubAllGlobals());
const fixture = (url: string) => {
  const op = url.split('/').at(-1);
  if (op === 'cu-prime') return {};
  if (op === 'cu-stock')
    return {
      data: {
        stockResult: { result: { rows: [{ fields: { item_cd: '123', item_nm: '과자' } }] } },
      },
    };
  if (op === 'cu-store') return { storeList: [{ storeCd: 's', storeNm: '점포', stock: '3' }] };
  if (op === 'gs25-products')
    return {
      SearchQueryResult: {
        Collection: [
          { Documentset: { Document: [{ field: { itemCode: '123', itemName: '과자' } }] } },
        ],
      },
    };
  if (op === 'seven-goods') return { data: { content: [{ itemCd: '123', itemOnm: '과자' }] } };
  throw Error(`unexpected direct request ${url}`);
};
it('REST와 MCP의 편의점 검색이 같은 릴레이 바인딩을 사용한다', async () => {
  clearSevenElevenReadCache();
  const fetcher = vi.fn(async (url: string) => Response.json(fixture(url)));
  vi.stubGlobal('fetch', fetcher);
  for (const path of [
    '/api/cu/inventory?keyword=과자&lat=37&lng=127',
    '/api/gs25/products?keyword=과자',
    '/api/seveneleven/products?query=과자',
  ]) {
    const response = await app.request(path, undefined, env);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('과자');
  }
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), {
      fetch: async (url, init) => app.request(new Request(url, init), undefined, env),
    }),
  );
  try {
    for (const [name, args] of [
      ['cu_check_inventory', { keyword: '과자', latitude: 37, longitude: 127 }],
      ['gs25_search_products', { keyword: '과자' }],
      ['seveneleven_search_products', { query: '과자' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain('과자');
    }
    expect(
      fetcher.mock.calls.every(([url]) => url.startsWith('https://relay.example/v1/convenience/')),
    ).toEqual(true);
  } finally {
    await client.close();
  }
});
