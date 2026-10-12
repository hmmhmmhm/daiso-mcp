import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
import {
  searchEmart24Products,
  fetchEmart24Stores,
  searchEmart24StockByStores,
  fetchEmart24StoreDetail,
} from '../../src/services/emart24/client.js';
const request = (operation: string, body: unknown, fresh = false) =>
  new Request(`http://localhost/v1/convenience/${operation}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer convenience',
      ...(fresh ? { 'x-relay-cache-bypass': 'true' } : {}),
    },
    body: JSON.stringify(body),
  });
const product = {
  currentPage: '1',
  pageCnt: '1',
  sortType: 'SALE',
  saleProductYn: 'N',
  searchWord: '커피',
};
const products = {
  totalCnt: 1,
  productList: [{ pluCd: '8801115139836', goodsNm: '커피', viewPrice: 2800 }],
};
const options = {
  convenienceRelayUrl: 'http://localhost:3000',
  convenienceRelayToken: 'convenience',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('이마트24 고정 HTTP 중계', () => {
  it('상품 검색을 기존 공식 폼 헤더로 보내고 인증·할당량·새 조회를 유지한다', async () => {
    const fetcher = vi.fn(async () => Response.json(products));
    const takeQuota = vi.fn(async () => true);
    const relay = createConvenienceRelay('convenience', { fetcher, takeQuota });
    expect((await relay(request('emart24-products', product))).status).toBe(200);
    expect((await relay(request('emart24-products', product))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await relay(request('emart24-products', product, true))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(takeQuota).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://everse.emart24.co.kr/stock/stock/search');
    expect(init.headers).toEqual({
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    });
    expect(new URLSearchParams(init.body as string).get('searchWord')).toBe('커피');
  });
  it.each([
    [
      'emart24-stores',
      { page: '1', search: '강남', AREA1: '서울특별시', SVR_24: '1' },
      { error: 0, count: 1, data: [{ CODE: '00940', TITLE: '청담하나점' }] },
      'https://emart24.co.kr/api1/store',
    ],
    [
      'emart24-stock',
      { searchPluCode: '8801115139836', bizNoArr: '00940' },
      {
        storeGoodsInfo: { pluCd: '8801115139836' },
        storeGoodsQty: [{ BIZNO: '00940', BIZQTY: '0' }],
      },
      'https://everse.emart24.co.kr/api/stock/v2/stock-search/store',
    ],
    [
      'emart24-store-detail',
      { bizNo: '00940' },
      { storeInfo: { storeNm: '청담하나점' } },
      'https://everse.emart24.co.kr/api/stock/stock/store/00940',
    ],
  ])('%s는 고정 GET 경로와 정상 오류 코드 0을 허용한다', async (operation, body, data, path) => {
    const fetcher = vi.fn(async () => Response.json(data));
    const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
    const response = await relay(request(operation, body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href.split('?')[0]).toBe(path);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });
  it('임의 URL·경로·필드와 인증 없는 호출은 원본을 호출하지 않는다', async () => {
    const fetcher = vi.fn();
    const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
    expect(
      (await relay(request('emart24-products', { ...product, url: 'https://example.com' }))).status,
    ).toBe(400);
    expect((await relay(request('emart24-store-detail', { bizNo: '../path' }))).status).toBe(400);
    const unauthenticated = new Request('http://localhost/v1/convenience/emart24-products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
    expect((await relay(unauthenticated)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    new Response('<title>403 Forbidden</title>', { status: 403 }),
    Response.json({ totalCnt: 1, productList: [{}] }),
    Response.json({ error: 1, data: [] }),
  ])('원본 차단과 잘못된 응답은 캐시하거나 성공 처리하지 않는다', async (upstream) => {
    const relay = createConvenienceRelay('convenience', {
      fetcher: async () => upstream.clone(),
      takeQuota: async () => true,
    });
    expect((await relay(request('emart24-products', product))).status).toBe(502);
  });
  it('원본 차단 응답의 스트림 취소가 실패해도 원래 조회 오류를 반환한다', async () => {
    const upstream = new Response('blocked', { status: 403 });
    const cancel = vi.spyOn(upstream.body!, 'cancel').mockRejectedValue(new Error('stream closed'));
    const relay = createConvenienceRelay('convenience', {
      fetcher: async () => upstream,
      takeQuota: async () => true,
    });
    expect((await relay(request('emart24-products', product))).status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('재고 숫자 0과 누락·음수 미확인을 구분하고 객체 수량을 거절한다', async () => {
    const data = {
      storeGoodsInfo: { pluCd: '123' },
      storeGoodsQty: [{ BIZNO: '00940', BIZQTY: { value: 0 } }],
    };
    const fetcher = vi.fn(async () => Response.json(data));
    const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
    expect(
      (await relay(request('emart24-stock', { searchPluCode: '123', bizNoArr: '00940' }))).status,
    ).toBe(502);
  });
  it('공식 원본의 재고 행 null은 실제 빈 목록으로 전달한다', async () => {
    const data = { storeGoodsInfo: { pluCd: '123' }, storeGoodsQty: null };
    const relay = createConvenienceRelay('convenience', {
      fetcher: async () => Response.json(data),
      takeQuota: async () => true,
    });
    const response = await relay(
      request('emart24-stock', { searchPluCode: '123', bizNoArr: '00940' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
  });
  it('재고만 30초에 만료하고 상품·매장 상세 캐시는 5분 유지한다', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
    try {
      const fetcher = vi.fn(async (url: RequestInfo | URL) =>
        Response.json(
          String(url).includes('stock-search')
            ? { storeGoodsInfo: { pluCd: '123' }, storeGoodsQty: [] }
            : String(url).includes('/store/')
              ? { storeInfo: { storeNm: '강남점' } }
              : products,
        ),
      );
      const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
      const calls = [
        ['emart24-stock', { searchPluCode: '123', bizNoArr: '00940' }],
        ['emart24-products', product],
        ['emart24-store-detail', { bizNo: '00940' }],
      ] as const;
      for (const [op, body] of calls) expect((await relay(request(op, body))).status).toBe(200);
      clock.mockReturnValue(130001);
      for (const [op, body] of calls) expect((await relay(request(op, body))).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(4);
      clock.mockReturnValue(400001);
      for (const [op, body] of calls) expect((await relay(request(op, body))).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(7);
    } finally {
      clock.mockRestore();
    }
  });
  it('호출 취소는 중계 원본 신호를 중단하며 성공을 만들지 않는다', async () => {
    const controller = new AbortController();
    let upstreamSignal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const relay = createConvenienceRelay('convenience', {
      fetcher: async (_url, init) => {
        upstreamSignal = init?.signal ?? undefined;
        started();
        return new Promise(() => {});
      },
      takeQuota: async () => true,
    });
    const req = new Request(request('emart24-products', product), { signal: controller.signal });
    const pending = relay(req);
    await ready;
    controller.abort();
    expect((await pending).status).toBe(499);
    expect(upstreamSignal?.aborted).toBe(true);
  });
  it('설정된 클라이언트의 잘못된 입력은 직접 조회나 중계 전에 거절한다', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(searchEmart24Products({ keyword: '잘못된\n검색' }, options)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('설정된 클라이언트는 같은 중계와 새 조회 헤더를 사용한다', async () => {
    const fetcher = vi.fn(async () => Response.json(products));
    vi.stubGlobal('fetch', fetcher);
    const result = await searchEmart24Products(
      { keyword: '커피', pageSize: 1 },
      { ...options, bypassCache: true },
    );
    expect(result.totalCount).toBe(1);
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:3000/v1/convenience/emart24-products');
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer convenience',
        'x-relay-cache-bypass': 'true',
      }),
    );
  });
  it('모든 클라이언트 작업은 같은 중계 설정을 전달한다', async () => {
    const fetcher = vi.fn(async (url: string) =>
      Response.json(
        url.includes('store-detail')
          ? { storeInfo: { storeNm: '매장' } }
          : url.includes('emart24-stock')
            ? { storeGoodsInfo: { pluCd: '123' }, storeGoodsQty: [] }
            : { error: 0, count: 0, data: [] },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await fetchEmart24Stores({ keyword: '강남' }, options);
    await searchEmart24StockByStores({ pluCd: '123', bizNos: ['00940'] }, options);
    await fetchEmart24StoreDetail('00940', options);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3000/v1/convenience/emart24-stores',
      'http://localhost:3000/v1/convenience/emart24-stock',
      'http://localhost:3000/v1/convenience/emart24-store-detail',
    ]);
  });
});
