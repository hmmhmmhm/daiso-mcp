/**
 * 앱 통합 테스트 - 올리브영 API
 */

import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/oliveyoung/stores', () => {
  it('매장 검색 결과를 반환한다', async () => {
    const encoded = Buffer.from(
      JSON.stringify({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          storeList: [{ storeCode: 'D176', storeName: '올리브영 명동 타운' }],
        },
      }),
      'utf8',
    ).toString('base64');

    mockFetch.mockResolvedValue(new Response(JSON.stringify({ statusCode: 200, httpResponseBody: encoded })));

    const res = await app.request('/api/oliveyoung/stores?keyword=명동', undefined, {
      ZYTE_API_KEY: 'test-key',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.stores).toHaveLength(1);
  });
});

describe('GET /api/oliveyoung/products', () => {
  it('상품 검색 결과를 반환한다', async () => {
    const productEncoded = Buffer.from(
      JSON.stringify({
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
            },
          ],
        },
      }),
      'utf8',
    ).toString('base64');

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 200, httpResponseBody: productEncoded })),
    );

    const res = await app.request('/api/oliveyoung/products?keyword=마스크팩', undefined, {
      ZYTE_API_KEY: 'test-key',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.keyword).toBe('마스크팩');
    expect(data.data.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg',
    );
  });
});

describe('GET /api/oliveyoung/inventory', () => {
  it('재고 정보를 반환한다', async () => {
    const storeEncoded = Buffer.from(
      JSON.stringify({
        status: 'SUCCESS',
        data: { totalCount: 1, storeList: [{ storeCode: 'D176', storeName: '올리브영 명동 타운' }] },
      }),
      'utf8',
    ).toString('base64');

    const productEncoded = Buffer.from(
      JSON.stringify({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A1',
              goodsName: '선크림 A',
              imagePath: '/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg',
              priceToPay: 10000,
            },
          ],
        },
      }),
      'utf8',
    ).toString('base64');
    const goodsInfoEncoded = Buffer.from(
      JSON.stringify({
        status: 'SUCCESS',
        data: { goodsInfo: { masterGoodsNumber: '8801' } },
      }),
      'utf8',
    ).toString('base64');
    const stockStoresEncoded = Buffer.from(
      JSON.stringify({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          storeList: [{ storeCode: 'D176', storeName: '올리브영 명동 타운', salesStoreYn: true, remainQuantity: 3 }],
        },
      }),
      'utf8',
    ).toString('base64');

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 200, httpResponseBody: storeEncoded })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 200, httpResponseBody: productEncoded })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 200, httpResponseBody: goodsInfoEncoded })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 200, httpResponseBody: stockStoresEncoded })));

    const res = await app.request('/api/oliveyoung/inventory?keyword=선크림', undefined, {
      ZYTE_API_KEY: 'test-key',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.keyword).toBe('선크림');
    expect(data.data.inventory.inStockCount).toBe(1);
    expect(data.data.inventory.stockCheckedCount).toBe(1);
    expect(data.data.inventory.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg'
    );
    expect(data.data.inventory.products[0].stockStatus).toBe('in_stock');
    expect(data.data.inventory.products[0].storeInventory.stores[0].stockLabel).toBe('재고 3개');
  });

  it('keyword 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/oliveyoung/inventory');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
  });
});
