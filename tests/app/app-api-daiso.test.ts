/**
 * 앱 통합 테스트 - 다이소 API
 */

import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/daiso/products', () => {
  it('검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [{ totalSize: 1, resultDocuments: [{ PD_NO: '1', PDNM: 'Test', PD_PRC: '1000' }] }],
          },
        }),
      ),
    );

    const res = await app.request('/api/daiso/products?q=test');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('검색어 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/products');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
  });
});

describe('GET /api/daiso/products/:id', () => {
  it('제품 정보를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [
              {
                totalSize: 1,
                resultDocuments: [{ PD_NO: '12345', PDNM: 'Test', PD_PRC: '1000' }],
              },
            ],
          },
        }),
      ),
    );

    const res = await app.request('/api/daiso/products/12345');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('12345');
  });
});

describe('GET /api/daiso/stores', () => {
  it('매장 검색 결과를 반환한다', async () => {
    const storeHtml = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0" data-info='{}'>
        <h4 class="place">테스트점</h4>
        <p class="addr">주소</p>
      </div>
    `;
    mockFetch.mockResolvedValue(new Response(storeHtml));

    const res = await app.request('/api/daiso/stores?keyword=테스트');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('검색 조건 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/stores');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_PARAMS');
  });
});

describe('GET /api/daiso/inventory', () => {
  it('재고 정보를 반환한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));

    const res = await app.request('/api/daiso/inventory?productId=12345');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.productId).toBe('12345');
  });

  it('productId 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/inventory');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_PRODUCT_ID');
  });
});

describe('GET /api/daiso/display-location', () => {
  it('진열 위치 정보를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ zoneNo: '60', stairNo: '2', storeErp: '04515' }],
        }),
      ),
    );

    const res = await app.request('/api/daiso/display-location?productId=12345&storeCode=04515');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.hasLocation).toBe(true);
  });

  it('productId 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/display-location?storeCode=04515');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_PRODUCT_ID');
  });

  it('storeCode 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/display-location?productId=12345');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_STORE_CODE');
  });
});
