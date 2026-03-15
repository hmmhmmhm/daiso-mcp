/**
 * 올리브영 상품 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchProductsTool } from '../../../../src/services/oliveyoung/tools/searchProducts.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createZyteResponse(body: unknown) {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  return new Response(
    JSON.stringify({
      statusCode: 200,
      httpResponseBody: encoded,
    }),
  );
}

describe('createSearchProductsTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchProductsTool('test-key');

    expect(tool.name).toBe('oliveyoung_search_products');
    expect(tool.metadata.title).toBe('올리브영 상품 검색');
  });

  it('상품 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
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
              originalPrice: 5000,
              discountRate: 40,
              o2oStockFlag: true,
              o2oRemainQuantity: 2,
            },
          ],
        },
      }),
    );

    const tool = createSearchProductsTool('test-key');
    const result = await tool.handler({ keyword: '마스크팩' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keyword).toBe('마스크팩');
    expect(parsed.totalCount).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.products[0].goodsName).toBe('마스크팩 A');
    expect(parsed.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg',
    );
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createSearchProductsTool('test-key');

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });
});
