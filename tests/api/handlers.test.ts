/**
 * API 핸들러 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleSearchProducts,
  handleGetProduct,
  handleFindStores,
  handleCheckInventory,
} from '../../src/api/handlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// mock Context 생성
function createMockContext(query: Record<string, string> = {}, params: Record<string, string> = {}) {
  return {
    req: {
      query: (key: string) => query[key],
      param: (key: string) => params[key],
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleSearchProducts>[0];
}

// 제품 검색 응답 생성
function createMockProductResponse(products: unknown[], totalSize = 100) {
  return {
    resultSet: {
      result: [{ totalSize, resultDocuments: products }],
    },
  };
}

describe('handleSearchProducts', () => {
  it('검색 결과를 반환한다', async () => {
    const products = [{ PD_NO: '1', PDNM: '테스트', PD_PRC: '1000' }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify(createMockProductResponse(products))));

    const ctx = createMockContext({ q: '테스트' });
    await handleSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ products: expect.any(Array) }),
      })
    );
  });

  it('검색어가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(q)를 입력해주세요.' },
      }),
      400
    );
  });

  it('빈 검색어도 에러를 반환한다', async () => {
    const ctx = createMockContext({ q: '  ' });
    await handleSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(q)를 입력해주세요.' },
      }),
      400
    );
  });

  it('페이지네이션 파라미터를 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(createMockProductResponse([]))));

    const ctx = createMockContext({ q: '테스트', page: '2', pageSize: '50' });
    await handleSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ page: 2, pageSize: 50 }),
      })
    );
  });

  it('API 에러 시 500 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const ctx = createMockContext({ q: '테스트' });
    await handleSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'SEARCH_FAILED', message: 'Network error' },
      }),
      500
    );
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValue('unknown error');

    const ctx = createMockContext({ q: '테스트' });
    await handleSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});

describe('handleGetProduct', () => {
  it('제품 정보를 반환한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '테스트상품',
      PD_PRC: '5000',
      ATCH_FILE_URL: '/img.jpg',
      BRND_NM: '다이소',
      SOLD_OUT_YN: 'N',
      NEW_PD_YN: 'Y',
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(createMockProductResponse([product]))));

    const ctx = createMockContext({}, { id: '12345' });
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: '12345',
          name: '테스트상품',
          price: 5000,
          currency: 'KRW',
          soldOut: false,
          isNew: true,
        }),
      })
    );
  });

  it('제품 ID가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({}, {});
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_ID', message: '제품 ID가 필요합니다.' },
      }),
      400
    );
  });

  it('제품을 찾지 못하면 404를 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ resultSet: { result: [{}] } })));

    const ctx = createMockContext({}, { id: 'notfound' });
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'NOT_FOUND', message: '제품을 찾을 수 없습니다.' },
      }),
      404
    );
  });

  it('PDNM이 없으면 EXH_PD_NM을 사용한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '',
      EXH_PD_NM: '대체이름',
      PD_PRC: '5000',
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(createMockProductResponse([product]))));

    const ctx = createMockContext({}, { id: '12345' });
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: '대체이름' }),
      })
    );
  });

  it('PD_PRC가 숫자가 아니면 0을 사용한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '테스트',
      PD_PRC: 'invalid',
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(createMockProductResponse([product]))));

    const ctx = createMockContext({}, { id: '12345' });
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ price: 0 }),
      })
    );
  });

  it('API 에러 시 500 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('API Error'));

    const ctx = createMockContext({}, { id: '12345' });
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'FETCH_FAILED', message: 'API Error' },
      }),
      500
    );
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValue(null);

    const ctx = createMockContext({}, { id: '12345' });
    await handleGetProduct(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'FETCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});

describe('handleFindStores', () => {
  const mockStoreHtml = `
    <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0" data-info='{}'>
      <h4 class="place">테스트점</h4>
      <em class="phone">T.02-1234-5678</em>
      <p class="addr">서울시 테스트구</p>
    </div>
  `;

  it('매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(mockStoreHtml));

    const ctx = createMockContext({ keyword: '테스트' });
    await handleFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ stores: expect.any(Array) }),
      })
    );
  });

  it('keyword나 sido가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_PARAMS', message: '검색어(keyword) 또는 지역(sido)을 입력해주세요.' },
      }),
      400
    );
  });

  it('sido만 있어도 검색 가능하다', async () => {
    mockFetch.mockResolvedValue(new Response(mockStoreHtml));

    const ctx = createMockContext({ sido: '서울' });
    await handleFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('limit 파라미터를 처리한다', async () => {
    const multipleStores = mockStoreHtml + mockStoreHtml + mockStoreHtml;
    mockFetch.mockResolvedValue(new Response(multipleStores));

    const ctx = createMockContext({ keyword: '테스트', limit: '2' });
    await handleFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stores: expect.any(Array) }),
        meta: expect.objectContaining({ total: 3 }),
      })
    );
  });

  it('API 에러 시 500 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const ctx = createMockContext({ keyword: '테스트' });
    await handleFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'SEARCH_FAILED', message: 'Network error' },
      }),
      500
    );
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '테스트' });
    await handleFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});

describe('handleCheckInventory', () => {
  it('재고 정보를 반환한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { stck: 50 } }))
    );
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        data: {
          msStrVOList: [
            { strCd: '1', strNm: '매장A', strAddr: '', strTno: '', opngTime: '', clsngTime: '', strLttd: 0, strLitd: 0, km: '', qty: '5' },
          ],
          intStrCont: 1,
        },
      }))
    );

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          productId: '12345',
          onlineStock: 50,
          storeInventory: expect.any(Object),
        }),
      })
    );
  });

  it('productId가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_PRODUCT_ID', message: '제품 ID(productId)를 입력해주세요.' },
      }),
      400
    );
  });

  it('위치 파라미터를 처리한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));

    const ctx = createMockContext({ productId: '12345', lat: '35.1', lng: '129.0' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: { latitude: 35.1, longitude: 129.0 },
        }),
      })
    );
  });

  it('API 에러 시 500 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('API Error'));

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'INVENTORY_CHECK_FAILED', message: 'API Error' },
      }),
      500
    );
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValue(123);

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'INVENTORY_CHECK_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});
