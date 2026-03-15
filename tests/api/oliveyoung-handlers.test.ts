/**
 * 올리브영 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleOliveyoungSearchProducts,
  handleOliveyoungFindStores,
  handleOliveyoungCheckInventory,
} from '../../src/api/handlers.js';

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
    env: {
      ZYTE_API_KEY: 'test-key',
    },
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleOliveyoungFindStores>[0];
}

function createMockZyteResponse(body: unknown) {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  return new Response(
    JSON.stringify({
      statusCode: 200,
      httpResponseBody: encoded,
    })
  );
}

describe('handleOliveyoungFindStores', () => {
  it('올리브영 매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      createMockZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          storeList: [
            {
              storeCode: 'D176',
              storeName: '올리브영 명동 타운',
              address: '서울 중구 명동길 53',
              latitude: 37.564,
              longitude: 126.985,
              pickupYn: false,
              o2oRemainQuantity: 0,
            },
          ],
        },
      })
    );

    const ctx = createMockContext({ keyword: '명동' });
    await handleOliveyoungFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ stores: expect.any(Array) }),
      })
    );
  });

  it('올리브영 매장 검색 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('zyte fail'));

    const ctx = createMockContext({ keyword: '명동' });
    await handleOliveyoungFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'OLIVEYOUNG_STORE_SEARCH_FAILED', message: 'zyte fail' },
      }),
      500
    );
  });

  it('keyword 없이도 기본 검색을 수행한다', async () => {
    mockFetch.mockResolvedValue(
      createMockZyteResponse({
        status: 'SUCCESS',
        data: { totalCount: 0, storeList: [] },
      })
    );

    const ctx = createMockContext({});
    await handleOliveyoungFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('올리브영 매장 검색의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(123);

    const ctx = createMockContext({ keyword: '명동' });
    await handleOliveyoungFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'OLIVEYOUNG_STORE_SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});

describe('handleOliveyoungSearchProducts', () => {
  it('올리브영 상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      createMockZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A1',
              goodsName: '마스크팩 A',
              imagePath: '/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg',
              priceToPay: 3000,
              originalPrice: 5000,
              discountRate: 40,
              o2oStockFlag: true,
              o2oRemainQuantity: 1,
            },
          ],
        },
      })
    );

    const ctx = createMockContext({ keyword: '마스크팩' });
    await handleOliveyoungSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyword: '마스크팩',
          count: 1,
          products: [
            expect.objectContaining({
              goodsName: '마스크팩 A',
              imageUrl: 'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg',
            }),
          ],
        }),
      })
    );
  });

  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleOliveyoungSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400
    );
  });

  it('올리브영 상품 검색 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('search fail'));

    const ctx = createMockContext({ keyword: '마스크팩' });
    await handleOliveyoungSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'OLIVEYOUNG_PRODUCT_SEARCH_FAILED', message: 'search fail' },
      }),
      500
    );
  });
});

describe('handleOliveyoungCheckInventory', () => {
  it('올리브영 재고 정보를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            storeList: [
              {
                storeCode: 'D176',
                storeName: '올리브영 명동 타운',
                address: '서울 중구 명동길 53',
                latitude: 37.564,
                longitude: 126.985,
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createMockZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            nextPage: false,
            serachList: [
              {
                goodsNumber: 'A1',
                goodsName: '선크림 A',
                priceToPay: 10000,
                originalPrice: 12000,
                discountRate: 16,
                o2oStockFlag: true,
                o2oRemainQuantity: 0,
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createMockZyteResponse({
          status: 'SUCCESS',
          data: { goodsInfo: { masterGoodsNumber: '8801' } },
        })
      )
      .mockResolvedValueOnce(
        createMockZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            storeList: [
              {
                storeCode: 'B040',
                storeName: '안산중앙역점',
                salesStoreYn: true,
                remainQuantity: 2,
              },
            ],
          },
        })
      );

    const ctx = createMockContext({ keyword: '선크림' });
    await handleOliveyoungCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyword: '선크림',
          inventory: expect.objectContaining({
            totalCount: 1,
            inStockCount: 1,
            outOfStockCount: 0,
            stockCheckedCount: 1,
            products: [
              expect.objectContaining({
                goodsName: '선크림 A',
                inStock: true,
                stockStatus: 'in_stock',
                stockSource: 'nearby_store',
              }),
            ],
          }),
        }),
      })
    );
  });

  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleOliveyoungCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400
    );
  });

  it('올리브영 재고 확인 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('inventory fail'));

    const ctx = createMockContext({ keyword: '선크림' });
    await handleOliveyoungCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'OLIVEYOUNG_INVENTORY_CHECK_FAILED', message: 'inventory fail' },
      }),
      500
    );
  });

  it('올리브영 재고 확인의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '선크림' });
    await handleOliveyoungCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'OLIVEYOUNG_INVENTORY_CHECK_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});
