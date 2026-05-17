/**
 * 이마트24 상품 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchProductsTool } from '../../../../src/services/emart24/tools/searchProducts.js';

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

    expect(tool.name).toBe('emart24_search_products');
    expect(tool.metadata.title).toBe('이마트24 상품 검색');
    expect(tool.metadata.outputSchema?.products.description).toContain('이마트24 상품');
  });

  it('검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          productList: [{ pluCd: '8800244010504', goodsNm: '두바이초콜릿', viewPrice: 3000 }],
        }),
      ),
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ keyword: '두바이' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalCount).toBe(1);
    expect(result.structuredContent).toMatchObject({ keyword: '두바이', count: 1 });
    expect(parsed.products[0].pluCd).toBe('8800244010504');
  });

  it('keyword가 비어 있으면 에러를 던진다', async () => {
    const tool = createSearchProductsTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });
});
