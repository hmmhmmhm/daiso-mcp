/**
 * 세븐일레븐 재고 확인 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckInventoryTool } from '../../../../src/services/seveneleven/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 상품 검색 응답 생성 헬퍼 */
function makeProductResponse(products: Array<Record<string, unknown>>) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        SearchQueryResult: {
          query: '핫식스',
          Collection: [
            {
              CollectionId: 'offline',
              Documentset: {
                totalCount: products.length,
                Document: products,
              },
            },
          ],
        },
      },
    }),
  );
}

/** 매장 검색 응답 생성 헬퍼 */
function makeStoreResponse(stores: Array<Record<string, unknown>>) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        SearchQueryResult: {
          query: '안산 중앙역',
          Collection: [
            {
              CollectionId: 'store',
              Documentset: {
                totalCount: stores.length,
                Document: stores,
              },
            },
          ],
        },
      },
    }),
  );
}

/** 상품별 재고 메타 응답 */
function makeStockProductMetaResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      prdNo: '100',
      itemCd: '8801234567890',
      itemOnm: '핫식스 250ml',
      smCd: '201051',
      stokMngCd: '201051',
      stokMngQty: 1,
      stockApplicationRate: '100',
      itemGbn: '008',
      ...overrides,
    }),
  );
}

/** 실재고 API 실패 응답 */
function makeStockErrorResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      code: 501,
      message: 'RSA 복호화 실패',
    }),
    { status: 400 },
  );
}

/** 실재고 API 성공 응답 */
function makeStockSuccessResponse(stores: Array<Record<string, unknown>>) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        smCd: '201051',
        storeList: stores,
      },
      message: '성공',
      code: 200,
    }),
  );
}

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('seveneleven_check_inventory');
    expect(tool.metadata.title).toBe('세븐일레븐 재고 확인');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('공백만 있는 keyword도 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ keyword: '   ' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('재고 API 실패 시 상품/매장 정보를 함께 반환한다', async () => {
    // 1) 상품 검색 → 성공
    // 2) 매장 검색 → 성공
    // 3) 상품별 재고 메타 조회 → 성공
    // 4) 실재고 API → RSA 실패
    mockFetch
      .mockResolvedValueOnce(
        makeProductResponse([
          {
            prdNo: '100',
            itemCd: '8801234567890',
            itemOnm: '핫식스 250ml',
            onlinePrice: 1500,
            onlineCost: 1500,
            repImgUrl: 'https://img.7-eleven.co.kr/hot6.jpg',
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeStoreResponse([
          {
            field: {
              storeCd: '54928',
              storeNm: '안산중앙일번가점',
              addr1: '경기 안산시 단원구 중앙대로 100',
              addr2: '',
              storeLat: '37.3156',
              storeLon: '126.8384',
              pickupYn: 'Y',
              dlvyYn: 'N',
              storeCloseYn: 'N',
            },
          },
        ]),
      )
      .mockResolvedValueOnce(makeStockProductMetaResponse())
      .mockResolvedValueOnce(makeStockErrorResponse());

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '핫식스', storeKeyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);

    // 상품 정보가 있어야 한다
    expect(parsed.product).toBeDefined();
    expect(parsed.product.itemCode).toBe('8801234567890');
    expect(parsed.product.itemName).toBe('핫식스 250ml');
    expect(parsed.product.salePrice).toBe(1500);

    // 재고 API 실패 상태
    expect(parsed.stockAvailable).toBe(false);
    expect(parsed.stockError).toEqual({
      cause: 'api',
      httpStatus: 400,
      code: 501,
      message: 'RSA 복호화 실패',
      raw: JSON.stringify({
        success: false,
        code: 501,
        message: 'RSA 복호화 실패',
      }),
    });
    expect(parsed.note).toContain('암호화 검증에서 거절');

    // 매장 목록은 존재해야 한다
    expect(parsed.inventory.totalStoreCount).toBe(1);
    expect(parsed.inventory.stores[0].storeName).toBe('안산중앙일번가점');
    expect(parsed.inventory.stores[0].stockQuantity).toBe(-1);
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://new.7-elevenapp.co.kr/api/v1/open/product/search/stock?itemCd=8801234567890',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'https://new.7-elevenapp.co.kr/api/v1/open/real-stock/multi/01/stocks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          smCd: '201051',
          stokMngCd: '201051',
          stokMngQty: 1,
          stockApplicationRate: '100',
          storeList: ['54928'],
        }),
      }),
    );
  });

  it('재고 API 성공 시 실시간 재고 데이터를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeProductResponse([
          {
            prdNo: '100',
            itemCd: '8801234567890',
            itemOnm: '핫식스 250ml',
            onlinePrice: 1500,
            onlineCost: 1500,
            repImgUrl: 'https://img.7-eleven.co.kr/hot6.jpg',
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeStoreResponse([
          {
            field: {
              storeCd: '54928',
              storeNm: '안산중앙일번가점',
              addr1: '경기 안산시 단원구 중앙대로 100',
              addr2: '',
              storeLat: '37.3156',
              storeLon: '126.8384',
              pickupYn: 'Y',
              dlvyYn: 'N',
              storeCloseYn: 'N',
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeStockProductMetaResponse(),
      )
      .mockResolvedValueOnce(
        makeStockSuccessResponse([
          {
            storeCd: '54928',
            stock: 5,
            stokMngQty: 0,
          },
        ]),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '핫식스', storeKeyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.stockAvailable).toBe(true);
    expect(parsed.stockError).toBeNull();
    expect(parsed.note).toContain('실시간 재고 데이터가 포함');
    expect(parsed.inventory.inStockStoreCount).toBe(1);
    expect(parsed.inventory.stores[0].stockQuantity).toBe(5);
    expect(parsed.inventory.stores[0].isSoldOut).toBe(false);
    expect(parsed.inventory.stores[0].storeName).toBe('안산중앙일번가점');
  });

  it('상품이 검색되지 않으면 product가 null이다', async () => {
    // 상품 검색 결과 없음
    mockFetch
      .mockResolvedValueOnce(
        makeProductResponse([]),
      )
      .mockResolvedValueOnce(
        makeStoreResponse([
          {
            field: {
              storeCd: '54928',
              storeNm: '안산중앙일번가점',
              addr1: '경기 안산시 단원구',
              addr2: '',
              storeLat: '37.3156',
              storeLon: '126.8384',
            },
          },
        ]),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '존재하지않는상품xyz', storeKeyword: '안산' });

    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.product).toBeNull();
    expect(parsed.stockAvailable).toBe(false);
    expect(parsed.inventory.totalStoreCount).toBe(1);
  });

  it('storeKeyword 없이도 동작한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeProductResponse([
          {
            prdNo: '100',
            itemCd: '8801234567890',
            itemOnm: '핫식스',
            onlinePrice: 1500,
            onlineCost: 1500,
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeStoreResponse([]),
      )
      .mockResolvedValueOnce(makeStockProductMetaResponse());

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '핫식스' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keyword).toBe('핫식스');
    expect(parsed.storeKeyword).toBe('');
    expect(parsed.product.itemName).toBe('핫식스');
  });

  it('재고 API 네트워크 에러 시 graceful fallback', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeProductResponse([
          {
            prdNo: '100',
            itemCd: '8801234567890',
            itemOnm: '핫식스',
            onlinePrice: 1500,
            onlineCost: 1500,
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeStoreResponse([
          {
            field: {
              storeCd: '11111',
              storeNm: '강남역점',
              addr1: '서울 강남구',
              addr2: '',
              storeLat: '37.4979',
              storeLon: '127.0276',
            },
          },
        ]),
      )
      .mockResolvedValueOnce(makeStockProductMetaResponse())
      .mockRejectedValueOnce(new Error('Network Error'));

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '핫식스', storeKeyword: '강남' });

    const parsed = JSON.parse(result.content[0].text);

    // 네트워크 에러여도 상품/매장 정보는 정상 반환
    expect(parsed.stockAvailable).toBe(false);
    expect(parsed.stockError).toEqual({
      cause: 'network',
      httpStatus: null,
      code: null,
      message: 'Network Error',
      raw: null,
    });
    expect(parsed.note).toContain('Network Error');
    expect(parsed.product.itemCode).toBe('8801234567890');
    expect(parsed.inventory.stores[0].storeName).toBe('강남역점');
    expect(parsed.inventory.stores[0].stockQuantity).toBe(-1);
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://new.7-elevenapp.co.kr/api/v1/open/product/search/stock?itemCd=8801234567890',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'https://new.7-elevenapp.co.kr/api/v1/open/real-stock/multi/01/stocks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          smCd: '201051',
          stokMngCd: '201051',
          stokMngQty: 1,
          stockApplicationRate: '100',
          storeList: ['11111'],
        }),
      }),
    );
  });
});
