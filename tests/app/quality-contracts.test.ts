import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createToolOutputSchema } from '../../src/core/outputSchema.js';
import { createCompareService } from '../../src/services/compare/index.js';
import { handleCompareProducts } from '../../src/api/compareHandlers.js';
import { handleGs25CheckInventory } from '../../src/api/gs25Handlers.js';
import { requestConvenienceRelay } from '../../src/utils/convenienceTransport.js';
import { compareProducts } from '../../src/services/compare/client.js';
import { handleCuCheckInventory, handleCuFindStores } from '../../src/api/handlers.js';
import { handleSevenElevenSearchProducts } from '../../src/api/sevenelevenHandlers.js';

const options = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'fixture' };
const bindings = { CONVENIENCE_RELAY_URL: options.convenienceRelayUrl, CONVENIENCE_RELAY_TOKEN: options.convenienceRelayToken };
afterEach(() => vi.unstubAllGlobals());

describe('조회 품질 공통 계약', () => {
  it('GS25 빈 매장 응답의 재고 합계는 MCP와 같은 미확인 null이다', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ stores: [] }));
    const app = new Hono<{ Bindings: typeof bindings }>(); app.get('/inventory', handleGs25CheckInventory);
    const response = await app.request('/inventory?itemCode=P&lat=37.4981&lng=127.0276', {}, bindings);
    expect(await response.json()).toMatchObject({ data: { inventory: { count: 0, totalStockQuantity: null, unknownStockStoreCount: 0 } } });
  });
  it.each(['CU', 'CU stores', 'Seven'] as const)('%s REST도 매분 한도 이유와 재시도 시간을 유지한다', async (service) => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429, headers: { 'Retry-After': '30', 'x-relay-quota-reason': 'minute' } }));
    const app = new Hono<{ Bindings: typeof bindings }>();
    app.get('/cu', handleCuCheckInventory); app.get('/seven', handleSevenElevenSearchProducts);
    app.get('/cu-stores', handleCuFindStores);
    const response = await app.request(service === 'CU' ? '/cu?keyword=콜라&lat=37.5&lng=127' : service === 'CU stores' ? '/cu-stores?lat=37.5&lng=127' : '/seven?query=콜라', {}, bindings);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(await response.json()).toMatchObject({ diagnostics: { quotaReason: 'minute', retryAfter: 30 } });
  });
  it.each(['daiso', 'gs25', 'seveneleven', 'emart24'] as const)('비교 %s는 upstream 초과 결과에도 서비스별 한도를 지킨다', async (service) => {
    const docs = [1, 2, 3].map(i => ({ field: { itemCode: `g${i}`, itemName: '콜라', itemCd: `s${i}`, itemOnm: '콜라', onlinePrice: 1 } }));
    vi.stubGlobal('fetch', async () => Response.json({
      resultSet: { result: [{ totalSize: 3, resultDocuments: [1, 2, 3].map(i => ({ PD_NO: `d${i}`, PDNM: '콜라', PD_PRC: '1' })) }] },
      SearchQueryResult: { Collection: [{ Documentset: { totalCount: 3, Document: docs } }] },
      data: { SearchQueryResult: { Collection: [{ CollectionId: 'goods', Documentset: { totalCount: 3, Document: docs } }] } },
      totalCnt: 3, productList: [1, 2, 3].map(i => ({ pluCd: `e${i}`, goodsNm: '콜라', viewPrice: 1 })),
    }));
    const result = await compareProducts({ keyword: '콜라', services: [service], limit: 1 });
    expect(result.errors).toEqual([]);
    expect(result.results).toHaveLength(1);
  });
  it('좌표 전용 극장 검색의 null 검색어와 미확인 온라인 재고를 허용한다', () => {
    expect(createToolOutputSchema('megabox_find_nearby_theaters').safeParse({ keyword: null, theaters: [] }).success).toBe(true);
    expect(createToolOutputSchema('daiso_check_inventory').safeParse({ onlineStock: null }).success).toBe(true);
  });
  it('카탈로그는 개수와 항목 객체를 검증하고 잘못된 구조는 거절한다', () => {
    const schema = createToolOutputSchema('seveneleven_get_catalog_snapshot');
    expect(schema.safeParse({ pages: { totalCount: 1, items: [{}] }, issues: { totalCount: 0, items: [] }, exhibitions: { totalCount: 0, items: [] } }).success).toBe(true);
    expect(schema.safeParse({ pages: { totalCount: '1', items: {} } }).success).toBe(false);
  });
  it('중계 429의 이유와 재시도 시간을 전송 오류에 유지한다', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429, headers: { 'Retry-After': '30', 'x-relay-quota-reason': 'minute' } }));
    await expect(requestConvenienceRelay('gs25-stock', {}, options)).rejects.toMatchObject({ status: 429, quotaReason: 'minute', retryAfter: 30 });
  });
  it('실제 GS25 REST handler가 중계 429를 500으로 바꾸지 않는다', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429, headers: { 'Retry-After': '30', 'x-relay-quota-reason': 'minute' } }));
    const app = new Hono<{ Bindings: typeof bindings }>();
    app.get('/inventory', handleGs25CheckInventory);
    const response = await app.request('/inventory?itemCode=P&lat=37.4981&lng=127.0276', {}, bindings);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(await response.json()).toMatchObject({ diagnostics: { quotaReason: 'minute', retryAfter: 30, upstreamStatus: 429 } });
  });
  it.each(['MCP', 'REST'])('가격 비교 %s는 두 편의점 검색에 중계 설정을 전달한다', async (kind) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: { SearchQueryResult: { Collection: [] } }, SearchQueryResult: { Collection: [] } }));
    vi.stubGlobal('fetch', fetcher);
    if (kind === 'MCP') {
      await createCompareService(options).getTools()[0].handler({ keyword: '콜라', services: 'gs25,seveneleven', limit: 1 });
    } else {
      const app = new Hono<{ Bindings: typeof bindings }>();
      app.get('/compare', handleCompareProducts);
      expect((await app.request('/compare?keyword=콜라&services=gs25,seveneleven&limit=1', {}, bindings)).status).toBe(200);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/relay.example\/v1\/convenience\//);
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture' });
    }
  });
});
