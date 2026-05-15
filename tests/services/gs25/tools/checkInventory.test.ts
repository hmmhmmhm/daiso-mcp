/**
 * GS25 재고 확인 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGs25StoresCache } from '../../../../src/services/gs25/client.js';
import { createCheckInventoryTool } from '../../../../src/services/gs25/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  clearGs25StoresCache();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// totalSearch API 응답 mock
function createTotalSearchResponse(itemCode: string, itemName: string) {
  return new Response(
    JSON.stringify({
      SearchQueryResult: {
        keywordInfo: { keyword: itemName, searchKeyword: itemName },
        Collection: [
          {
            CollectionId: 'woodel_gs',
            Documentset: {
              totalCount: 1,
              Document: [
                {
                  field: {
                    itemCode,
                    itemName,
                    shortItemName: itemName,
                    itemImageUrl: 'https://example.com/image.jpg',
                    starPoint: '4.5',
                    stockCheckYn: 'Y',
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  );
}

// store/stock API 응답 mock
function createStoreStockResponse(stores: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ stores }));
}

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('gs25_check_inventory');
    expect(tool.metadata.title).toBe('GS25 재고 확인');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('재고 결과를 반환한다', async () => {
    // 1. totalSearch API 응답
    mockFetch.mockResolvedValueOnce(createTotalSearchResponse('8801117752804', '오감자'));

    // 2. store/stock API 응답
    mockFetch.mockResolvedValueOnce(
      createStoreStockResponse([
        {
          storeCode: '1',
          storeName: '강남역점',
          storeAddress: '서울 강남구',
          storeXCoordination: '127',
          storeYCoordination: '37.5',
          searchItemName: '오감자',
          searchItemSellPrice: 1700,
          realStockQuantity: 3,
        },
      ]),
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({
      keyword: '오감자',
      latitude: 37.5,
      longitude: 127,
      storeLimit: 10,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.product.name).toBe('오감자');
    expect(parsed.itemCodeUsed).toBe(true);
    expect(parsed.itemCode).toBe('8801117752804');
    expect(parsed.inventory.inStockStoreCount).toBe(1);
    expect(parsed.inventory.stores[0].distanceM).toBe(0);
  });

  it('storeKeyword 기반 지오코딩이 성공하면 좌표를 반영한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    // 1. 기본 매장 목록 조회 (지오코딩용)
    mockFetch.mockResolvedValueOnce(
      createStoreStockResponse([{ storeCode: 'BASE1', storeName: '강남역점', storeAddress: '서울 강남구 강남대로 1' }]),
    );

    // 2. Google Geocoding API 응답
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{ geometry: { location: { lat: 37.5, lng: 127 } } }],
        }),
      ),
    );

    // 3. totalSearch API 응답
    mockFetch.mockResolvedValueOnce(createTotalSearchResponse('8801117752804', '오감자'));

    // 4. store/stock API 응답
    mockFetch.mockResolvedValueOnce(
      createStoreStockResponse([
        {
          storeCode: '1',
          storeName: '강남역점',
          storeAddress: '서울 강남구',
          storeXCoordination: '127',
          storeYCoordination: '37.5',
          searchItemName: '오감자',
          realStockQuantity: 1,
        },
      ]),
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '오감자', storeKeyword: '강남' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.geocodeUsed).toBe(true);
    expect(parsed.location).toEqual({ latitude: 37.5, longitude: 127 });

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });

  it('상품 검색 결과가 없으면 keyword fallback을 사용한다', async () => {
    // 1. totalSearch API 응답 (빈 결과)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            keywordInfo: { keyword: '없는상품', searchKeyword: '없는상품' },
            Collection: [],
          },
        }),
      ),
    );

    // 2. store/stock API 응답 (keyword fallback)
    mockFetch.mockResolvedValueOnce(
      createStoreStockResponse([{ storeCode: '1', storeName: '강남역점', searchItemName: '', realStockQuantity: 0 }]),
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '없는상품' });
    const parsed = JSON.parse(result.content[0].text);

    // itemCode가 없으면 itemCodeUsed는 false
    expect(parsed.itemCodeUsed).toBe(false);
    expect(parsed.itemCode).toBeNull();
    // 좌표는 기본값(서울 강남)이 설정됨
    expect(parsed.location).toEqual({ latitude: 37.4979, longitude: 127.0276 });
    expect(parsed.product.name).toBeNull();
  });

  it('위치 기반 재고 조회 결과가 있으면 storeKeyword 문자열 필터가 비어도 가까운 재고 매장을 유지한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch.mockResolvedValueOnce(
      createStoreStockResponse([
        { storeCode: 'BASE1', storeName: '역삼센터점', storeAddress: '서울 강남구 테헤란로 1' },
      ]),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{ geometry: { location: { lat: 37.4979, lng: 127.0276 } } }],
        }),
      ),
    );

    mockFetch.mockResolvedValueOnce(createTotalSearchResponse('8801117752804', '오감자'));

    mockFetch.mockResolvedValueOnce(
      createStoreStockResponse([
        {
          storeCode: 'near',
          storeName: '역삼센터점',
          storeAddress: '서울 테헤란로',
          storeXCoordination: '127.0276',
          storeYCoordination: '37.4979',
          searchItemName: '오감자',
          searchItemSellPrice: 1700,
          realStockQuantity: 3,
        },
      ]),
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '오감자', storeKeyword: '강남', storeLimit: 5 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filterRelaxed).toBe(true);
    expect(parsed.inventory.count).toBe(1);
    expect(parsed.inventory.stores[0].storeCode).toBe('near');
    expect(parsed.inventory.inStockStoreCount).toBe(1);

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });
});
