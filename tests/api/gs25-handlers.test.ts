/**
 * GS25 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleGs25CheckInventory,
  handleGs25FindStores,
  handleGs25SearchProducts,
} from '../../src/api/gs25Handlers.js';
import { clearGs25StoresCache } from '../../src/services/gs25/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  clearGs25StoresCache();
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
  } as unknown as Parameters<typeof handleGs25FindStores>[0];
}

describe('handleGs25FindStores', () => {
  it('매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [{ storeCode: '1', storeName: '강남역점', storeAddress: '서울 강남구' }],
        }),
      ),
    );

    const ctx = createMockContext({ keyword: '강남' });
    await handleGs25FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ stores: expect.any(Array) }),
      }),
    );
  });

  it('좌표가 없고 keyword가 있으면 지오코딩을 시도한다', async () => {
    const ctx = createMockContext({ keyword: '강남' });
    (ctx as { env: Record<string, string> }).env = { GOOGLE_MAPS_API_KEY: 'test-google-key' };

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5, lng: 127 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stores: [{ storeCode: '1', storeName: '강남역점', storeAddress: '서울 강남구' }] })),
      );

    await handleGs25FindStores(ctx);

    const payload = (ctx.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      data: { geocodeUsed: boolean; location: { latitude: number; longitude: number } };
    };
    expect(payload.data.geocodeUsed).toBe(true);
    expect(payload.data.location).toEqual({ latitude: 37.5, longitude: 127 });
  });

  it('매장 검색 중 예외 발생 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('store fail'));

    const ctx = createMockContext({ keyword: '강남' });
    await handleGs25FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'GS25_STORE_SEARCH_FAILED', message: 'store fail' },
      }),
      500,
    );
  });

  it('매장 검색 중 알 수 없는 예외도 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '강남' });
    await handleGs25FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'GS25_STORE_SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });
});

describe('handleGs25SearchProducts', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleGs25SearchProducts(ctx);

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
      new Response(JSON.stringify({ stores: [{ storeCode: '1', searchItemName: '오감자', realStockQuantity: 2 }] })),
    );

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      }),
    );
  });

  it('상품 검색 중 예외 발생 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('product fail'));

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'GS25_PRODUCT_SEARCH_FAILED', message: 'product fail' },
      }),
      500,
    );
  });

  it('상품 검색 중 알 수 없는 예외를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'GS25_PRODUCT_SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });
});

describe('handleGs25CheckInventory', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleGs25CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('재고 검색 결과를 반환한다', async () => {
    // 1단계: totalSearch API (keyword → itemCode)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            Collection: [{ Documentset: { Document: [{ field: { itemCode: '123', itemName: '오감자' } }] } }],
          },
        }),
      ),
    );

    // 2단계: store/stock API (itemCode + 좌표 → 재고)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          stores: [
            {
              storeCode: '1',
              storeName: '강남역점',
              searchItemName: '오감자',
              realStockQuantity: 1,
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          inventory: expect.objectContaining({ inStockStoreCount: 1 }),
        }),
      }),
    );
  });

  it('storeKeyword + 지오코딩 성공 분기를 처리한다', async () => {
    const ctx = createMockContext({ keyword: '오감자', storeKeyword: '강남' });
    (ctx as { env: Record<string, string> }).env = { GOOGLE_MAPS_API_KEY: 'test-google-key' };

    mockFetch
      // 1. storeKeyword 기준 매장 조회 (지오코딩 주소 획득용)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stores: [{ storeCode: 'B', storeName: '강남역점', storeAddress: '서울 강남구' }] })),
      )
      // 2. 지오코딩
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5, lng: 127 } } }],
          }),
        ),
      )
      // 3. totalSearch API (keyword → itemCode)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            SearchQueryResult: {
              Collection: [{ Documentset: { Document: [{ field: { itemCode: '123', itemName: '오감자' } }] } }],
            },
          }),
        ),
      )
      // 4. store/stock API (itemCode + 좌표 → 재고)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [{ storeCode: '1', storeName: '강남역점', searchItemName: '오감자', realStockQuantity: 1 }],
          }),
        ),
      );

    await handleGs25CheckInventory(ctx);

    const payload = (ctx.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      data: { geocodeUsed: boolean; location: { latitude: number; longitude: number } };
    };
    expect(payload.data.geocodeUsed).toBe(true);
    expect(payload.data.location).toEqual({ latitude: 37.5, longitude: 127 });
  });

  it('storeKeyword가 있어도 지오코딩 실패 시 location은 null이다', async () => {
    const ctx = createMockContext({ keyword: '오감자', storeKeyword: '강남' });
    (ctx as { env: Record<string, string> }).env = { GOOGLE_MAPS_API_KEY: 'test-google-key' };

    mockFetch
      // 1. storeKeyword 기준 매장 조회 (지오코딩 주소 획득용)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stores: [{ storeCode: 'B', storeName: '강남역점', storeAddress: '서울 강남구' }] })),
      )
      // 2. 지오코딩 실패
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] })))
      // 3. totalSearch API (keyword → itemCode)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            SearchQueryResult: {
              Collection: [{ Documentset: { Document: [{ field: { itemCode: '123', itemName: '오감자' } }] } }],
            },
          }),
        ),
      )
      // 4. store/stock API (기본 좌표 사용)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stores: [{ storeCode: '1', storeName: '강남역점', searchItemName: '', realStockQuantity: 0 }] })),
      );

    await handleGs25CheckInventory(ctx);

    const payload = (ctx.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      data: { geocodeUsed: boolean; location: null };
    };
    expect(payload.data.geocodeUsed).toBe(false);
    expect(payload.data.location).toBeNull();
  });

  it('재고 검색 중 알 수 없는 예외를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'GS25_INVENTORY_CHECK_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });

  it('재고 검색 중 Error 예외를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('inventory fail'));

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'GS25_INVENTORY_CHECK_FAILED', message: 'inventory fail' },
      }),
      500,
    );
  });
});
