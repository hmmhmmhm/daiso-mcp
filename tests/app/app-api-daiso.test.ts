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

  it('역명 키워드가 비면 붙여쓴 변형으로 재시도한다', async () => {
    const emptyHtml = '<div></div>';
    const matchedHtml = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0" data-info='{}'>
        <h4 class="place">안산중앙점</h4>
        <p class="addr">경기 안산시</p>
      </div>
    `;
    mockFetch.mockResolvedValueOnce(new Response(emptyHtml)).mockResolvedValueOnce(new Response(matchedHtml));

    const res = await app.request('/api/daiso/stores?keyword=%EC%95%88%EC%82%B0%20%EC%A4%91%EC%95%99%EC%97%AD');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.stores[0].name).toBe('안산중앙점');
  });
});

describe('GET /api/daiso/inventory', () => {
  it('재고 정보를 반환한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    // 상품 메타데이터 응답
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [{
              totalSize: 1,
              resultDocuments: [{
                PD_NO: '12345',
                PDNM: '테스트상품',
                PD_PRC: '1000',
                ATCH_FILE_URL: '/img.jpg',
              }],
            }],
          },
        }),
      ),
    );

    const res = await app.request('/api/daiso/inventory?productId=12345');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.productId).toBe('12345');
    expect(data.data.product.imageUrl).toContain('/img.jpg');
  });

  it('productId 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/inventory');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_PRODUCT_ID');
  });

  it('역명 키워드가 비면 붙여쓴 변형으로 재시도한다', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('selOnlStck')) {
        return new Response(JSON.stringify({ success: false }));
      }

      if (url.includes('FindStoreGoods')) {
        return new Response(
          JSON.stringify({
            resultSet: {
              result: [{
                totalSize: 1,
                resultDocuments: [{
                  PD_NO: '12345',
                  PDNM: '테스트상품',
                  PD_PRC: '1000',
                }],
              }],
            },
          }),
        );
      }

      if (url.includes('/ms/msg/selStr')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.keyword === '안산 중앙역') {
          return new Response(JSON.stringify({ data: [] }));
        }
        if (body.keyword === '안산중앙역') {
          return new Response(
            JSON.stringify({
              data: [
                {
                  strCd: '11199',
                  strNm: '안산중앙점',
                  strAddr: '경기 안산시',
                  strTno: '1522-4400',
                  opngTime: '1000',
                  clsngTime: '2200',
                  strLttd: 37.3,
                  strLitd: 126.8,
                  km: '0.1',
                  parkYn: 'N',
                  usimYn: 'N',
                  pkupYn: 'N',
                  taxfYn: 'N',
                  elvtYn: 'N',
                  entrRampYn: 'N',
                  nocashYn: 'N',
                },
              ],
            }),
          );
        }
      }

      if (url.includes('/auth/request')) {
        return new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        });
      }

      if (url.includes('selStrPkupStck')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ pdNo: '12345', strCd: '11199', stck: '3' }],
          }),
        );
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const res = await app.request('/api/daiso/inventory?productId=12345&keyword=%EC%95%88%EC%82%B0%20%EC%A4%91%EC%95%99%EC%97%AD');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.storeInventory.stores[0].storeCode).toBe('11199');
  });
});

describe('GET /api/daiso/display-location', () => {
  it('진열 위치 정보를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('display-token', { headers: { 'X-DM-UID': 'dm-uid-123' } }))
      .mockResolvedValueOnce(
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

  it('productId가 공백이면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/display-location?productId=%20%20%20&storeCode=04515');

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

  it('storeCode가 공백이면 에러를 반환한다', async () => {
    const res = await app.request('/api/daiso/display-location?productId=12345&storeCode=%20%20%20');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_STORE_CODE');
  });
});
