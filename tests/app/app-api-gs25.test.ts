/**
 * 앱 통합 테스트 - GS25 API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

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
          stores: [{ storeCode: '1', searchItemName: '오감자', realStockQuantity: 2 }],
        }),
      ),
    );

    const res = await app.request('/api/gs25/products?keyword=오감자');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.count).toBe(1);
  });
});

describe('GET /api/gs25/inventory', () => {
  it('GS25 재고 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
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

  it('keyword 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/gs25/inventory');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
  });
});
