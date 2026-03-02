/**
 * 제품 검색 도구 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchProducts, createSearchProductsTool } from '../../../../src/services/daiso/tools/searchProducts.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 테스트용 API 응답 생성
function createMockProductResponse(products: unknown[], totalSize = 100) {
  return {
    resultSet: {
      result: [
        {
          totalSize,
          resultDocuments: products,
        },
      ],
    },
  };
}

describe('fetchProducts', () => {
  it('검색 결과를 반환한다', async () => {
    const mockProducts = [
      {
        PD_NO: '12345',
        PDNM: '테스트 상품',
        PD_PRC: '5000',
        ATCH_FILE_URL: '/images/test.jpg',
        BRND_NM: '다이소',
        SOLD_OUT_YN: 'N',
        NEW_PD_YN: 'Y',
        PKUP_OR_PSBL_YN: 'Y',
      },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse(mockProducts)))
    );

    const result = await fetchProducts('테스트');

    expect(result.totalCount).toBe(100);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toEqual({
      id: '12345',
      name: '테스트 상품',
      price: 5000,
      imageUrl: expect.stringContaining('/images/test.jpg'),
      brand: '다이소',
      soldOut: false,
      isNew: true,
      pickupAvailable: true,
    });
  });

  it('결과가 없는 경우 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ resultSet: { result: [{}] } }))
    );

    const result = await fetchProducts('없는상품');

    expect(result.totalCount).toBe(0);
    expect(result.products).toEqual([]);
  });

  it('EXH_PD_NM을 대체 이름으로 사용한다', async () => {
    const mockProducts = [
      {
        PD_NO: '12345',
        PDNM: '',
        EXH_PD_NM: '대체 이름',
        PD_PRC: '1000',
      },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse(mockProducts)))
    );

    const result = await fetchProducts('테스트');

    expect(result.products[0].name).toBe('대체 이름');
  });

  it('페이지네이션 파라미터를 전달한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([])))
    );

    await fetchProducts('검색어', 2, 50);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('pageNum=2');
    expect(calledUrl).toContain('cntPerPage=50');
    expect(calledUrl).toContain('searchTerm=%EA%B2%80%EC%83%89%EC%96%B4');
  });

  it('브랜드가 없는 경우 undefined로 설정한다', async () => {
    const mockProducts = [
      {
        PD_NO: '12345',
        PDNM: '상품',
        PD_PRC: '1000',
        BRND_NM: '',
      },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse(mockProducts)))
    );

    const result = await fetchProducts('테스트');

    expect(result.products[0].brand).toBeUndefined();
  });

  it('totalSize가 없는 경우 0을 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        resultSet: {
          result: [{
            resultDocuments: [{ PD_NO: '1', PDNM: 'T', PD_PRC: '1000' }],
          }],
        },
      }))
    );

    const result = await fetchProducts('테스트');

    expect(result.totalCount).toBe(0);
  });

  it('PDNM과 EXH_PD_NM 모두 없으면 빈 문자열을 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([
        { PD_NO: '1', PDNM: '', EXH_PD_NM: '', PD_PRC: '1000' },
      ])))
    );

    const result = await fetchProducts('테스트');

    expect(result.products[0].name).toBe('');
  });

  it('PD_PRC가 숫자가 아니면 0을 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([
        { PD_NO: '1', PDNM: 'T', PD_PRC: '' },
      ])))
    );

    const result = await fetchProducts('테스트');

    expect(result.products[0].price).toBe(0);
  });
});

describe('createSearchProductsTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchProductsTool();

    expect(tool.name).toBe('daiso_search_products');
    expect(tool.metadata.title).toBe('제품 검색');
    expect(tool.metadata.description).toContain('검색');
    expect(tool.metadata.inputSchema.query).toBeDefined();
  });

  it('핸들러가 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([
        { PD_NO: '1', PDNM: '상품', PD_PRC: '1000' },
      ])))
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ query: '테스트' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.query).toBe('테스트');
    expect(parsed.products).toHaveLength(1);
  });

  it('빈 검색어는 에러를 던진다', async () => {
    const tool = createSearchProductsTool();

    await expect(tool.handler({ query: '' })).rejects.toThrow('검색어를 입력해주세요.');
    await expect(tool.handler({ query: '   ' })).rejects.toThrow('검색어를 입력해주세요.');
  });

  it('기본 페이지 값을 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([])))
    );

    const tool = createSearchProductsTool();
    const result = await tool.handler({ query: '테스트' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(30);
  });
});
