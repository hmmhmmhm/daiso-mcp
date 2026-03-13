/**
 * GS25 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachDistanceToGs25Stores,
  calculateDistanceM,
  clearGs25StoresCache,
  extractGs25ProductCandidates,
  fetchGs25Stores,
  filterGs25StoresByKeyword,
  geocodeGs25Address,
  sortGs25Stores,
} from '../../../src/services/gs25/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  clearGs25StoresCache();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchGs25Stores', () => {
  it('GS25 매장 목록을 정규화해 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [
            {
              storeCode: 'VE463',
              storeName: '강남역점',
              storeAddress: '서울시 강남구',
              storeTelephoneNumber: '02-1234-5678',
              storeXCoordination: '127.0276',
              storeYCoordination: '37.4982',
              realStockQuantity: '3',
              pickupStkQty: 1,
              dlvyStkQty: 2,
              isSoldOutYn: 'N',
              searchItemName: '오리온)오감자50G',
              searchItemSellPrice: '1700',
              propertyList: [{ storePropertyCode: '49', storePropertyName: '반값택배픽업' }],
            },
          ],
        }),
      ),
    );

    const result = await fetchGs25Stores();

    expect(result.totalCount).toBe(1);
    expect(result.cacheHit).toBe(false);
    expect(result.stores[0]).toEqual(
      expect.objectContaining({
        storeCode: 'VE463',
        latitude: 37.4982,
        longitude: 127.0276,
        realStockQuantity: 3,
        searchItemName: '오리온)오감자50G',
      }),
    );
  });

  it('캐시가 있으면 재요청하지 않는다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ stores: [{ storeCode: '1', storeName: 'A' }] })));

    await fetchGs25Stores();
    const cached = await fetchGs25Stores();

    expect(cached.cacheHit).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('storeCode 파라미터를 포함해 요청할 수 있다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ stores: [{ storeCode: 'VE463', storeName: 'A' }] })));

    await fetchGs25Stores({ storeCode: 'VE463', useCache: false });

    const calledUrl = String(mockFetch.mock.calls[0][0]);
    expect(calledUrl).toContain('storeCode=VE463');
  });
});

describe('유틸 함수', () => {
  it('calculateDistanceM는 동일 좌표에서 0을 반환한다', () => {
    expect(calculateDistanceM(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });

  it('filterGs25StoresByKeyword는 이름/주소를 기준으로 필터한다', () => {
    const stores = [
      {
        storeCode: '1',
        storeName: '강남역점',
        address: '서울 강남구',
        propertyNames: [],
      },
      {
        storeCode: '2',
        storeName: '홍대점',
        address: '서울 마포구',
        propertyNames: [],
      },
    ] as never;

    const filtered = filterGs25StoresByKeyword(stores, '강남');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].storeCode).toBe('1');
  });

  it('filterGs25StoresByKeyword는 공백이 다른 매장명도 매칭한다', () => {
    const stores = [
      {
        storeCode: '1',
        storeName: '안산주은점',
        address: '경기 안산시 단원구 고잔1길 69',
        propertyNames: [],
      },
    ] as never;

    const filtered = filterGs25StoresByKeyword(stores, '안산 주은점');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].storeCode).toBe('1');
  });

  it('attachDistanceToGs25Stores는 거리 값을 추가한다', () => {
    const stores = [
      {
        storeCode: '1',
        storeName: 'A',
        address: '',
        phone: '',
        latitude: 37.5,
        longitude: 127,
        serviceCode: '01',
        realStockQuantity: 0,
        pickupStockQuantity: 0,
        deliveryStockQuantity: 0,
        isSoldOut: false,
        searchItemName: '',
        searchItemSellPrice: null,
        propertyNames: [],
        properties: [],
        distanceM: null,
      },
    ];

    const withDistance = attachDistanceToGs25Stores(stores, 37.5, 127);
    expect(withDistance[0].distanceM).toBe(0);
  });

  it('sortGs25Stores는 거리 우선으로 정렬한다', () => {
    const sorted = sortGs25Stores([
      {
        storeCode: '1',
        storeName: 'B',
        distanceM: 500,
        realStockQuantity: 0,
      },
      {
        storeCode: '2',
        storeName: 'A',
        distanceM: 100,
        realStockQuantity: 0,
      },
    ] as never);

    expect(sorted[0].storeCode).toBe('2');
  });

  it('sortGs25Stores는 거리/재고가 같으면 이름순으로 정렬한다', () => {
    const sorted = sortGs25Stores([
      {
        storeCode: '1',
        storeName: '나',
        distanceM: 100,
        realStockQuantity: 1,
      },
      {
        storeCode: '2',
        storeName: '가',
        distanceM: 100,
        realStockQuantity: 1,
      },
    ] as never);

    expect(sorted[0].storeCode).toBe('2');
  });

  it('extractGs25ProductCandidates는 상품 후보를 집계한다', () => {
    const products = extractGs25ProductCandidates([
      { searchItemName: '오감자', searchItemSellPrice: 1700, realStockQuantity: 3 },
      { searchItemName: '오감자', searchItemSellPrice: 1700, realStockQuantity: 0 },
      { searchItemName: '포카칩', searchItemSellPrice: 1800, realStockQuantity: 1 },
    ] as never);

    expect(products).toHaveLength(2);
    expect(products[0]).toEqual(
      expect.objectContaining({
        name: '오감자',
        matchedStoreCount: 2,
        inStockStoreCount: 1,
        totalStockQuantity: 3,
      }),
    );
  });

  it('extractGs25ProductCandidates는 동일 재고 조건에서 이름순 정렬한다', () => {
    const products = extractGs25ProductCandidates([
      { searchItemName: '나상품', searchItemSellPrice: 1000, realStockQuantity: 1 },
      { searchItemName: '가상품', searchItemSellPrice: 1000, realStockQuantity: 1 },
    ] as never);

    expect(products[0].name).toBe('가상품');
  });
});

describe('geocodeGs25Address', () => {
  it('Google Geocoding 응답을 좌표로 변환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{ geometry: { location: { lat: 37.3172, lng: 126.8354 } } }],
        }),
      ),
    );

    const result = await geocodeGs25Address('경기도 안산시 단원구 중앙대로 885', {
      googleMapsApiKey: 'test-key',
    });

    expect(result).toEqual({ latitude: 37.3172, longitude: 126.8354 });
  });

  it('api key가 없으면 null을 반환한다', async () => {
    const result = await geocodeGs25Address('서울 강남구');
    expect(result).toBeNull();
  });

  it('주소가 비어 있으면 null을 반환한다', async () => {
    const result = await geocodeGs25Address('   ', {
      googleMapsApiKey: 'test-key',
    });
    expect(result).toBeNull();
  });

  it('status가 OK가 아니면 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] })));

    const result = await geocodeGs25Address('없는 주소', {
      googleMapsApiKey: 'test-key',
    });
    expect(result).toBeNull();
  });

  it('결과 location이 없으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'OK', results: [{}] })));

    const result = await geocodeGs25Address('서울 강남구', {
      googleMapsApiKey: 'test-key',
    });
    expect(result).toBeNull();
  });

  it('좌표가 0이면 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{ geometry: { location: { lat: 0, lng: 0 } } }],
        }),
      ),
    );

    const result = await geocodeGs25Address('서울 강남구', {
      googleMapsApiKey: 'test-key',
    });
    expect(result).toBeNull();
  });
});
