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
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createSearchProductsTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('상품 후보를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [
            { storeCode: '1', searchItemName: '오감자', searchItemSellPrice: 1700, realStockQuantity: 2 },
            { storeCode: '2', searchItemName: '오감자', searchItemSellPrice: 1700, realStockQuantity: 0 },
          ],
        }),
      ),
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ keyword: '오감자', limit: 5 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.products[0].name).toBe('오감자');
    expect(parsed.products[0].matchedStoreCount).toBe(2);
  });
});
