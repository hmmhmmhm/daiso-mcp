/**
 * GS25 상품 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchProductsTool } from '../../../../src/services/gs25/tools/searchProducts.js';

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

    expect(tool.name).toBe('gs25_search_products');
    expect(tool.metadata.title).toBe('GS25 상품 키워드 검색');
    expect(tool.metadata.outputSchema?.products.description).toContain('GS25 상품');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createSearchProductsTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('상품 목록과 itemCode를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            Collection: [
              {
                Documentset: {
                  Document: [
                    {
                      field: {
                        itemCode: '8801056038861',
                        itemName: '롯데)핫식스250ML',
                        shortItemName: '핫식스250ML',
                        itemImageUrl: 'https://example.com/image.jpg',
                        starPoint: '4.5',
                        stockCheckYn: 'Y',
                      },
                    },
                    {
                      field: {
                        itemCode: '8801056249212',
                        itemName: '롯데)핫식스더킹애플홀릭355ML',
                        shortItemName: '핫식스더킹',
                        itemImageUrl: 'https://example.com/image2.jpg',
                        starPoint: '4.2',
                        stockCheckYn: 'Y',
                      },
                    },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ keyword: '핫식스', limit: 5 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(result.structuredContent).toMatchObject({ keyword: '핫식스', count: 2 });
    expect(parsed.products[0].itemCode).toBe('8801056038861');
    expect(parsed.products[0].itemName).toBe('롯데)핫식스250ML');
    expect(parsed.products[1].itemCode).toBe('8801056249212');
    expect(parsed.note).toContain('itemCode');
  });

  it('검색 결과가 없으면 안내 note를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            Collection: [],
          },
        }),
      ),
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ keyword: '없는상품', limit: 5 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.note).toContain('검색 결과가 없습니다');
  });
});
