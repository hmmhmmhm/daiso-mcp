/**
 * 세븐일레븐 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleSevenElevenCheckInventory,
  handleSevenElevenGetCatalogSnapshot,
  handleSevenElevenGetSearchPopwords,
  handleSevenElevenSearchStores,
  handleSevenElevenSearchProducts,
} from '../../src/api/sevenelevenHandlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {},
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleSevenElevenSearchProducts>[0];
}

describe('handleSevenElevenSearchProducts', () => {
  it('query가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleSevenElevenSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(query)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('상품 검색 결과를 반환한다', async () => {
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

    const ctx = createMockContext({ query: '삼각김밥' });
    await handleSevenElevenSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ count: 1 }),
      }),
    );
  });
});

describe('handleSevenElevenSearchStores', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleSevenElevenSearchStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_KEYWORD', message: '매장 검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('매장 검색 결과를 반환한다', async () => {
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

    const ctx = createMockContext({ keyword: '안산 중앙역' });
    await handleSevenElevenSearchStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ count: 1 }),
      }),
    );
  });
});

describe('handleSevenElevenCheckInventory', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleSevenElevenCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

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

    const ctx = createMockContext({ keyword: '핫식스', storeKeyword: '안산 중앙역', storeLimit: '10' });
    await handleSevenElevenCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyword: '핫식스',
          storeKeyword: '안산 중앙역',
          stockAvailable: true,
          inventory: expect.objectContaining({
            totalStoreCount: 1,
            inStockStoreCount: 1,
            count: 1,
          }),
        }),
        meta: expect.objectContaining({
          total: 1,
          pageSize: 10,
        }),
      }),
    );
  });
});

describe('handleSevenElevenGetSearchPopwords', () => {
  it('인기 검색어 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            list: [{ keyword: '삼각김밥' }],
          },
        }),
      ),
    );

    const ctx = createMockContext({ label: 'home' });
    await handleSevenElevenGetSearchPopwords(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ count: 1, keywords: ['삼각김밥'] }),
      }),
    );
  });
});

describe('handleSevenElevenGetCatalogSnapshot', () => {
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

    const ctx = createMockContext({ includeIssues: 'true', includeExhibition: 'true', limit: '5' });
    await handleSevenElevenGetCatalogSnapshot(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          pages: expect.objectContaining({ totalCount: 1 }),
          issues: expect.objectContaining({ totalCount: 1 }),
          exhibitions: expect.objectContaining({ totalCount: 1 }),
        }),
      }),
    );
  });
});
