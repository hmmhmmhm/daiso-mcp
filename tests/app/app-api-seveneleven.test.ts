/**
 * 앱 통합 테스트 - 세븐일레븐 API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/seveneleven/products', () => {
  it('세븐일레븐 상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            SearchQueryResult: {
              query: '삼각김밥',
              Collection: [
                {
                  CollectionId: 'offline',
                  Documentset: {
                    totalCount: 1,
                    Document: [{ prdNo: '1', itemCd: '8801', itemOnm: '참치마요' }],
                  },
                },
              ],
            },
          },
        }),
      ),
    );

    const res = await app.request('/api/seveneleven/products?query=삼각김밥');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.count).toBe(1);
    expect(data.data.products[0].itemCode).toBe('8801');
  });

  it('query가 없으면 에러를 반환한다', async () => {
    const res = await app.request('/api/seveneleven/products');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
  });
});

describe('GET /api/seveneleven/popwords', () => {
  it('인기 검색어 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            list: [{ keyword: '삼각김밥' }, { keyword: '도시락' }],
          },
        }),
      ),
    );

    const res = await app.request('/api/seveneleven/popwords?label=home');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.available).toBe(true);
    expect(data.data.keywords).toEqual(['삼각김밥', '도시락']);
  });

  it('인기 검색어가 비어 있으면 unavailable 안내를 포함한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} })));

    const res = await app.request('/api/seveneleven/popwords?label=home');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.available).toBe(false);
    expect(data.data.note).toContain('찾지 못했습니다');
  });
});

describe('GET /api/seveneleven/stores', () => {
  it('세븐일레븐 매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            SearchQueryResult: {
              query: '안산 중앙역',
              Collection: [
                {
                  CollectionId: 'store',
                  Documentset: {
                    totalCount: 1,
                    Document: [{ field: { storCd: '54928', storNm: '안산중앙일번가점', addr: '경기 안산시' } }],
                  },
                },
              ],
            },
          },
        }),
      ),
    );

    const res = await app.request('/api/seveneleven/stores?keyword=안산 중앙역');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.count).toBe(1);
    expect(data.data.stores[0].storeCode).toBe('54928');
  });

  it('keyword가 없으면 에러를 반환한다', async () => {
    const res = await app.request('/api/seveneleven/stores');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_KEYWORD');
  });
});

describe('GET /api/seveneleven/inventory', () => {
  it('세븐일레븐 재고 조회 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              SearchQueryResult: {
                query: '핫식스',
                Collection: [
                  {
                    CollectionId: 'offline',
                    Documentset: {
                      totalCount: 1,
                      Document: [
                        {
                          field: {
                            prdNo: '1',
                            itemCd: '8801056252243',
                            itemOnm: '칠성)핫식스더킹퍼플500ml',
                            onlinePrice: 3000,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              SearchQueryResult: {
                query: '안산중앙',
                Collection: [
                  {
                    CollectionId: 'store',
                    Documentset: {
                      totalCount: 1,
                      Document: [
                        {
                          field: {
                            storeCd: '54928',
                            storeNm: '안산중앙일번가점',
                            addr1: '경기 안산시 단원구 중앙대로 907',
                            addr2: '',
                            storeLat: '37.3173',
                            storeLon: '126.8370',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prdNo: '1',
            itemCd: '8801056252243',
            itemOnm: '칠성)핫식스더킹퍼플500ml',
            smCd: '133975',
            stokMngCd: '133975',
            stokMngQty: 1,
            stockApplicationRate: '100',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              smCd: '133975',
              storeList: [{ storeCd: '54928', stock: 14, stokMngQty: 0 }],
            },
            message: '성공',
            code: 200,
          }),
        ),
      );

    const res = await app.request('/api/seveneleven/inventory?keyword=%ED%95%AB%EC%8B%9D%EC%8A%A4&storeKeyword=%EC%95%88%EC%82%B0%20%EC%A4%91%EC%95%99%EC%97%AD&storeLimit=10');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.keyword).toBe('핫식스');
    expect(data.data.inventory.totalStoreCount).toBe(1);
    expect(data.data.inventory.stores[0].stockQuantity).toBe(14);
  });

  it('keyword가 없으면 에러를 반환한다', async () => {
    const res = await app.request('/api/seveneleven/inventory');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
  });
});

describe('GET /api/seveneleven/catalog', () => {
  it('카탈로그 스냅샷 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              content: [{ prdNo: '1', itemCd: '111', itemOnm: '상품A' }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              content: [{ prdNo: '2', itemCd: '222', itemOnm: '이슈상품' }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                exhibitionIdx: 10,
                exhibitionName: '3월 신상품전',
                exhibitionStartDate: '2026-03-01',
                exhibitionEndDate: '2026-03-31',
                exhibitionProductList: [{}, {}],
              },
            ],
          }),
        ),
      );

    const res = await app.request('/api/seveneleven/catalog?limit=5');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.pages.totalCount).toBe(1);
    expect(data.data.issues.totalCount).toBe(1);
    expect(data.data.exhibitions.totalCount).toBe(1);
  });
});
