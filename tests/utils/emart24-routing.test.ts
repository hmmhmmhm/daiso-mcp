import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDirectRoute } from '../../src/utils/directRoutes.js';
import { emart24DirectRouteSpecs } from '../../src/services/emart24/relaySpecs.js';
import { requestConvenienceRelay } from '../../src/utils/convenienceTransport.js';
import { withRouteRouting, type RouteSnapshot } from '../../src/utils/routeHealth.js';
const options = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'token' };
const products = { totalCnt: 1, productList: [{ pluCd: '123', goodsNm: '커피' }] };
const fixtures = {
  'emart24-products': products,
  'emart24-stores': { error: 0, count: 0, data: [] },
  'emart24-stock': { storeGoodsInfo: { pluCd: '123' }, storeGoodsQty: null },
  'emart24-store-detail': { storeInfo: { storeNm: '강남매장' } },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('이마트24 기존 직접 경로 선택', () => {
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])(
    '%s의 읽기 전용 사전 점검은 실제 요청과 같은 검증기를 쓴다',
    async (key) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(fixtures[key])),
      );
      expect(await checkDirectRoute(key)).toMatchObject({ key, direct: true });
    },
  );
  it('403 직접 실패는 남은 예산으로 중계하고 해당 작업만 5분 대기한다', async () => {
    const pending: Promise<unknown>[] = [];
    const snapshot: RouteSnapshot = {
      routes: {
        'emart24-products': { key: 'emart24-products', direct: true, checkedAt: Date.now() },
      },
      relays: { convenience: { group: 'convenience', healthy: true, checkedAt: Date.now() } },
    };
    const ns = {
      idFromName: () => ({ toString: () => 'emart-test' }),
      get: () => ({ fetch: async () => Response.json(snapshot) }),
    } as unknown as DurableObjectNamespace;
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith('https://relay.example')
        ? Response.json(products)
        : new Response('403 Forbidden', { status: 403 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const run = () =>
      withRouteRouting(
        ns,
        (p) => pending.push(p),
        () =>
          requestConvenienceRelay(
            'emart24-products',
            emart24DirectRouteSpecs['emart24-products'].probe(),
            options,
            5000,
          ),
      );
    await run();
    await Promise.all(pending);
    fetcher.mockClear();
    expect(await run()).toEqual(products);
    expect(await run()).toEqual(products);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('everse.emart24.co.kr')),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('relay.example')),
    ).toHaveLength(2);
  });
});
