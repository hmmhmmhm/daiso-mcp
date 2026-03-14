/**
 * 이마트24 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleEmart24CheckInventory,
  handleEmart24FindStores,
  handleEmart24SearchProducts,
} from '../../src/api/emart24Handlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {},
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleEmart24FindStores>[0];
}

describe('handleEmart24FindStores', () => {
  it('매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 0,
          count: 1,
          data: [{ CODE: '28339', TITLE: '강남스퀘어점', LATITUDE: 37.5, LONGITUDE: 127.0 }],
        }),
      ),
    );

    const ctx = createMockContext({ keyword: '강남', lat: '37.5', lng: '127.0' });
    await handleEmart24FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          appliedKeyword: '강남',
          stores: expect.any(Array),
        }),
      }),
    );
  });

  it('예외 발생 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('store fail'));

    const ctx = createMockContext({ keyword: '강남' });
    await handleEmart24FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'EMART24_STORE_SEARCH_FAILED', message: 'store fail' },
      }),
      500,
    );
  });

  it('service24h 파라미터를 그대로 반영한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 0, count: 0, data: [] })));

    const ctx = createMockContext({ keyword: '강남', service24h: 'true' });
    await handleEmart24FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          service24h: true,
        }),
      }),
    );
  });

  it('거리 정렬 분기를 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 0,
          count: 3,
          data: [
            { CODE: 'N1', TITLE: '좌표없음1', LATITUDE: 0, LONGITUDE: 0 },
            { CODE: 'Y1', TITLE: '좌표있음', LATITUDE: 37.5, LONGITUDE: 127.0 },
            { CODE: 'N2', TITLE: '좌표없음2', LATITUDE: 0, LONGITUDE: 0 },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ lat: '37.5', lng: '127.0' });
    await handleEmart24FindStores(ctx);

    const payload = (ctx.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      data: { stores: Array<{ storeCode: string }> };
    };
    expect(payload.data.stores[0].storeCode).toBe('Y1');
  });
});

describe('handleEmart24SearchProducts', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleEmart24SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ totalCnt: 1, productList: [{ pluCd: '8801', goodsNm: '과자' }] })),
    );

    const ctx = createMockContext({ keyword: '과자' });
    await handleEmart24SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          products: expect.any(Array),
        }),
      }),
    );
  });

  it('상품 검색의 알 수 없는 예외를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '과자' });
    await handleEmart24SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'EMART24_PRODUCT_SEARCH_FAILED',
          message: '알 수 없는 오류가 발생했습니다.',
        },
      }),
      500,
    );
  });
});

describe('handleEmart24CheckInventory', () => {
  it('필수 파라미터가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleEmart24CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_PLU_CD', message: '상품 PLU 코드(pluCd) 또는 검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('재고 조회 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8801', goodsNm: '과자' },
            storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '2' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeInfo: {
              storeNm: '강남스퀘어점',
              tel: '02-000-0000',
              storeAddr: '서울특별시 강남구 강남대로 396',
            },
          }),
        ),
      );

    const ctx = createMockContext({ pluCd: '8801', bizNoArr: '28339' });
    await handleEmart24CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          pluCd: '8801',
          count: 1,
        }),
      }),
    );
  });

  it('pluCd와 storeKeyword로도 재고 조회를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: '28339', TITLE: '안산중앙점', LATITUDE: 37.3187, LONGITUDE: 126.8389 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8801', goodsNm: '고양이 츄르' },
            storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '2' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeInfo: {
              storeNm: '안산중앙점',
              tel: '031-000-0000',
              storeAddr: '경기도 안산시 단원구 중앙대로 123',
            },
          }),
        ),
      );

    const ctx = createMockContext({ pluCd: '8801', storeKeyword: '안산 중앙역' });
    await handleEmart24CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          storeFilters: expect.objectContaining({
            storeKeyword: '안산 중앙역',
          }),
          count: 1,
        }),
      }),
    );
  });

  it('매장 상세/수량 일부 누락도 안전하게 처리한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8801' },
            storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '2' }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ storeInfo: { storeNm: 'A' } })))
      .mockRejectedValueOnce(new Error('detail fail'));

    const ctx = createMockContext({ pluCd: '8801', bizNoArr: '28339,99999' });
    await handleEmart24CheckInventory(ctx);

    const payload = (ctx.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      data: { stores: Array<{ bizNo: string; bizQty: number; storeName: string }> };
    };
    expect(payload.data.stores).toHaveLength(2);
    expect(payload.data.stores[1].bizNo).toBe('99999');
    expect(payload.data.stores[1].bizQty).toBe(0);
    expect(payload.data.stores[1].storeName).toBe('');
  });

  it('bizNoArr가 비어 있으면 에러를 반환한다', async () => {
    const ctx = createMockContext({ pluCd: '8801', bizNoArr: ' , ' });
    await handleEmart24CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'MISSING_BIZ_NO_ARR',
          message: '매장 코드 목록(bizNoArr) 또는 매장 검색 조건(storeKeyword/area1/area2/lat/lng)을 입력해주세요.',
        },
      }),
      400,
    );
  });

  it('재고 조회 중 알 수 없는 예외를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ pluCd: '8801', bizNoArr: '28339' });
    await handleEmart24CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'EMART24_INVENTORY_CHECK_FAILED',
          message: '알 수 없는 오류가 발생했습니다.',
        },
      }),
      500,
    );
  });
});
