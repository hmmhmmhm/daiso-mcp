/**
 * 세븐일레븐 상품 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchProductsTool } from '../../../../src/services/seveneleven/tools/searchProducts.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSearchProductsTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchProductsTool();

    expect(tool.name).toBe('seveneleven_search_products');
    expect(tool.metadata.title).toBe('세븐일레븐 상품 검색');
  });

  it('query가 없으면 에러를 던진다', async () => {
    const tool = createSearchProductsTool();

    await expect(tool.handler({ query: '' })).rejects.toThrow('상품 검색어(query)를 입력해주세요.');
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
                    totalCount: 2,
                    Document: [
                      {
                        prdNo: '1',
                        itemCd: '880000000001',
                        itemOnm: '참치마요 삼각김밥',
                        onlinePrice: 1300,
                        onlineCost: 1300,
                      },
                      {
                        field: {
                          prdNo: '2',
                          itemCd: '880000000002',
                          itemOnm: '전주비빔 삼각김밥',
                          onlinePrice: 1500,
                          onlineCost: 1500,
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
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ query: '삼각김밥', size: 20 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.count).toBe(2);
    expect(parsed.products[0].itemCode).toBe('880000000001');
    expect(parsed.products[1].itemCode).toBe('880000000002');
    expect(parsed.collectionIds).toEqual(['offline']);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://new.7-elevenapp.co.kr/api/v1/open/search/goods',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: '삼각김밥',
          pageNo: 0,
          pageSize: 20,
        }),
      }),
    );
  });
});
