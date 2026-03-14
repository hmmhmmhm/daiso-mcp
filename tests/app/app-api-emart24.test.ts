/**
 * 앱 통합 테스트 - 이마트24 API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/emart24/stores', () => {
  it('이마트24 매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 0,
          count: 1,
          data: [{ CODE: '28339', TITLE: '강남스퀘어점', LATITUDE: 37.5, LONGITUDE: 127.0 }],
        }),
      ),
    );

    const res = await app.request('/api/emart24/stores?keyword=강남');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.appliedKeyword).toBe('강남');
    expect(data.data.stores).toHaveLength(1);
  });
});

describe('GET /api/emart24/products', () => {
  it('이마트24 상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          productList: [{ pluCd: '8800244010504', goodsNm: '두바이초콜릿' }],
        }),
      ),
    );

    const res = await app.request('/api/emart24/products?keyword=두바이');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.products).toHaveLength(1);
  });
});

describe('GET /api/emart24/inventory', () => {
  it('이마트24 재고 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8800244010504', goodsNm: '두바이초콜릿' },
            storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '3' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeInfo: {
              storeNm: '강남스퀘어점',
              tel: '02-000-0000',
              storeAddr: '서울특별시 강남구 강남대로 396',
            },
          }),
        ),
      );

    const res = await app.request('/api/emart24/inventory?pluCd=8800244010504&bizNoArr=28339');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.count).toBe(1);
  });

  it('pluCd와 storeKeyword 조합으로도 재고 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: '28339', TITLE: '안산중앙점', LATITUDE: 37.3187, LONGITUDE: 126.8389 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8800244010504', goodsNm: '고양이 츄르' },
            storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '4' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeInfo: {
              storeNm: '안산중앙점',
              tel: '031-000-0000',
              storeAddr: '경기도 안산시 단원구 중앙대로 123',
            },
          }),
        ),
      );

    const res = await app.request('/api/emart24/inventory?pluCd=8800244010504&storeKeyword=안산%20중앙역');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.storeFilters.storeKeyword).toBe('안산 중앙역');
    expect(data.data.count).toBe(1);
  });

  it('pluCd가 없으면 에러를 반환한다', async () => {
    const res = await app.request('/api/emart24/inventory?bizNoArr=28339');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_PLU_CD');
  });
});
