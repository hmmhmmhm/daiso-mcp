/**
 * 앱 통합 테스트 - GS25 API
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';
import { clearGs25StoresCache } from '../../src/services/gs25/client.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

beforeEach(() => {
  clearGs25StoresCache();
});

describe('GET /api/gs25/stores', () => {
  it('GS25 매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [{ storeCode: '1', storeName: '강남역점', storeAddress: '서울 강남구' }],
        }),
      ),
    );

    const res = await app.request('/api/gs25/stores?keyword=강남');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.stores).toHaveLength(1);
  });
});

describe('GET /api/gs25/products', () => {
  it('GS25 상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            Collection: [
              {
                Documentset: {
                  Document: [{ field: { itemCode: '123', itemName: '오감자', stockCheckYn: 'Y' } }],
                },
              },
            ],
          },
        }),
      ),
    );

    const res = await app.request('/api/gs25/products?keyword=오감자');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.count).toBe(1);
    expect(data.data.products[0].itemCode).toBe('123');
  });
});

describe('GET /api/gs25/inventory', () => {
  it('GS25 재고 검색 결과를 반환한다', async () => {
    // 1단계: totalSearch API 응답 (keyword → itemCode)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            Collection: [
              {
                Documentset: {
                  Document: [{ field: { itemCode: '8801234567890', itemName: '오감자' } }],
                },
              },
            ],
          },
        }),
      ),
    );

    // 2단계: store/stock API 응답 (itemCode + 좌표 → 재고)
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

    const res = await app.request('/api/gs25/inventory?keyword=오감자');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.inventory.inStockStoreCount).toBe(1);
  });

  it('itemCode만으로도 GS25 재고 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: 'A1',
                storeName: 'GS25 안산중앙점',
                storeAddress: '경기 안산시 단원구 중앙대로 907',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.3187, lng: 126.8389 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: 'A1',
                storeName: 'GS25 안산중앙점',
                searchItemName: '핫식스250ML',
                realStockQuantity: 6,
              },
            ],
          }),
        ),
      );

    const res = await app.request(
      '/api/gs25/inventory?itemCode=8801056038861&storeKeyword=%EC%95%88%EC%82%B0%20%EC%A4%91%EC%95%99%EC%97%AD',
      undefined,
      { GOOGLE_MAPS_API_KEY: 'test-google-key' },
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.itemCode).toBe('8801056038861');
    expect(data.data.inventory.inStockStoreCount).toBe(1);
  });

  it('keyword 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/gs25/inventory');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
    expect(data.error.message).toBe('검색어(keyword) 또는 상품 코드(itemCode)를 입력해주세요.');
  });
});
