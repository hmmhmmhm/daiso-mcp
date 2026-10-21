/** 심사 화면에서 관찰한 인수를 실제 MCP/서비스/HTTP 경계까지 실행합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { DAISOMALL_API } from '../../src/services/daiso/api.js';
import { MCP_SMOKE_SCENARIOS } from '../../scripts/ops/mcp-smoke.js';

afterEach(() => vi.unstubAllGlobals());
async function call(name: string, args: Record<string, unknown>) {
  const r = await app.fetch(
    new Request('https://local.test/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    }),
    { CONVENIENCE_RELAY_URL: 'https://relay.example', CONVENIENCE_RELAY_TOKEN: 'test-token' },
  );
  expect(r.status).toBe(200);
  const line = (await r.text()).split('\n').find((l) => l.startsWith('data: '))!;
  return JSON.parse(line.slice(6)).result;
}
it('실제 다이소 상품 검색과 인증 매장 재고를 통합 도구로 실행하고 0/미확인을 구분한다', async () => {
  const stockBody: unknown[] = [];
  const fetcher = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(DAISOMALL_API.SEARCH_PRODUCTS))
      return Response.json({
        resultSet: {
          result: [
            {
              totalSize: 1,
              resultDocuments: [{ PD_NO: '1049516', PDNM: '수납박스', PD_PRC: '1000' }],
            },
          ],
        },
      });
    if (url === DAISOMALL_API.ONLINE_STOCK)
      return Response.json({ success: true, data: { stck: 4 } });
    if (url === DAISOMALL_API.STORE_SEARCH_V2)
      return Response.json({
        success: true,
        data: [1, 2, 3].map((i) => ({
          strCd: 's' + i,
          strNm: '강남' + i + '점',
          strAddr: '서울 강남구',
          strLttd: 37.5,
          strLitd: 127,
        })),
      });
    if (url === DAISOMALL_API.AUTH_REQUEST)
      return new Response('test-token', { headers: { 'X-DM-UID': 'test-uid' } });
    if (url === DAISOMALL_API.STORE_INVENTORY_V2) {
      stockBody.push(JSON.parse(String(init?.body)));
      expect(new Headers(init?.headers).has('Authorization')).toBe(true);
      return Response.json({
        success: true,
        data: [
          { strCd: 's1', stck: 5 },
          { strCd: 's2', stck: 0 },
        ],
      });
    }
    throw Error('예상하지 않은 원본 요청: ' + url);
  });
  vi.stubGlobal('fetch', fetcher);
  const search = await call('search_products', {
    service: 'daiso',
    query: '수납박스',
    includeSoldOut: true,
  });
  expect(search.isError).not.toBe(true);
  expect(search.structuredContent.products[0].id).toBe('1049516');
  const r = await call('check_inventory', {
    service: 'daiso',
    operation: 'by_name',
    query: '수납박스',
    storeQuery: '강남',
    latitude: 37.5,
    longitude: 127,
    storeLimit: 3,
    productLimit: 1,
  });
  expect(r.isError).not.toBe(true);
  expect(r.structuredContent.selectedProduct.id).toBe('1049516');
  expect(r.structuredContent.storeInventory).toMatchObject({
    inStockCount: 1,
    outOfStockCount: 1,
    unknownStockCount: 1,
  });
  expect(
    r.structuredContent.storeInventory.stores.map((s: { quantity: unknown }) => s.quantity),
  ).toEqual([5, 0, null]);
  expect(stockBody).toEqual([[1, 2, 3].map((i) => ({ pdNo: '1049516', strCd: 's' + i }))]);
  expect(MCP_SMOKE_SCENARIOS[0].validate(r.structuredContent)).toBeNull();
});
it('카탈로그는 편의점 중계 응답을 검증하며 502를 빈 성공으로 바꾸지 않는다', async () => {
  const fetcher = vi.fn(async (input: unknown) => {
    if (String(input).endsWith('/seven-popwords'))
      return Response.json({ success: true, data: ['커피'] });
    throw Error('예상하지 않은 중계 경로');
  });
  vi.stubGlobal('fetch', fetcher);
  const good = await call('get_catalog', {
    operation: 'popwords',
    includeIssues: true,
    includeExhibition: true,
  });
  expect(good.isError).not.toBe(true);
  expect(good.structuredContent).toMatchObject({ available: true, count: 1, keywords: ['커피'] });
  expect(good.content.at(-1).text).toContain('적용하지 않았습니다');
  fetcher.mockImplementation(async () =>
    Response.json({ error: 'Relay request failed' }, { status: 502 }),
  );
  const bad = await call('get_catalog', { operation: 'snapshot' });
  expect(bad.isError).toBe(true);
  expect(bad.structuredContent).toBeUndefined();
  expect(bad.content[0].text).toContain('CONVENIENCE_RELAY_FAILED');
});
