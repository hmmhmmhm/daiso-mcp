/**
 * 가격 정보 조회 도구 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchProductById,
  createGetPriceInfoTool,
} from '../../../../src/services/daiso/tools/getPriceInfo.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 테스트용 API 응답 생성
function createMockProductResponse(products: unknown[]) {
  return {
    resultSet: {
      result: [
        {
          totalSize: products.length,
          resultDocuments: products,
        },
      ],
    },
  };
}

describe('fetchProductById', () => {
  it('정확한 ID 매칭 상품을 반환한다', async () => {
    const products = [
      { PD_NO: '12345', PDNM: '다른상품', PD_PRC: '1000' },
      { PD_NO: '67890', PDNM: '정확한상품', PD_PRC: '5000' },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse(products)))
    );

    const product = await fetchProductById('67890');

    expect(product?.PDNM).toBe('정확한상품');
  });

  it('정확한 매칭이 없으면 첫 번째 상품을 반환한다', async () => {
    const products = [
      { PD_NO: '11111', PDNM: '첫번째상품', PD_PRC: '2000' },
      { PD_NO: '22222', PDNM: '두번째상품', PD_PRC: '3000' },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse(products)))
    );

    const product = await fetchProductById('99999');

    expect(product?.PDNM).toBe('첫번째상품');
  });

  it('결과가 없으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ resultSet: { result: [{}] } }))
    );

    const product = await fetchProductById('12345');

    expect(product).toBeNull();
  });

  it('resultDocuments가 비어있으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([])))
    );

    const product = await fetchProductById('12345');

    expect(product).toBeNull();
  });
});

describe('createGetPriceInfoTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createGetPriceInfoTool();

    expect(tool.name).toBe('daiso_get_price_info');
    expect(tool.metadata.title).toBe('가격 정보');
  });

  it('productId도 productName도 없으면 에러를 던진다', async () => {
    const tool = createGetPriceInfoTool();

    await expect(tool.handler({})).rejects.toThrow(
      '상품 ID(productId) 또는 상품명(productName)을 입력해주세요.'
    );
  });

  it('productId로 가격 정보를 조회한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '테스트상품',
      PD_PRC: '5000',
      ATCH_FILE_URL: '/images/test.jpg',
      BRND_NM: '다이소',
      SOLD_OUT_YN: 'N',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.productId).toBe('12345');
    expect(parsed.productName).toBe('테스트상품');
    expect(parsed.currentPrice).toBe(5000);
    expect(parsed.currency).toBe('KRW');
    expect(parsed.soldOut).toBe(false);
  });

  it('productName으로 가격 정보를 조회한다', async () => {
    const product = {
      PD_NO: '99999',
      PDNM: '이름검색상품',
      PD_PRC: '3000',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productName: '이름검색' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.productName).toBe('이름검색상품');
  });

  it('productId가 undefined이고 productName만 있으면 productName으로 검색한다', async () => {
    const product = {
      PD_NO: '77777',
      PDNM: 'productName전용',
      PD_PRC: '2000',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: undefined, productName: 'productName전용' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.productName).toBe('productName전용');
  });

  it('productId가 빈 문자열이고 productName이 있으면 productName으로 검색한다', async () => {
    const product = {
      PD_NO: '88888',
      PDNM: '빈ID테스트',
      PD_PRC: '4000',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: '', productName: '빈ID테스트' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.productName).toBe('빈ID테스트');
  });

  it('productId가 있으면 productName보다 우선한다', async () => {
    const product = { PD_NO: '12345', PDNM: 'ID검색결과', PD_PRC: '1000' };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    await tool.handler({ productId: '12345', productName: '무시됨' });

    // 검색어로 productId가 사용되었는지 확인
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('searchTerm=12345');
  });

  it('상품을 찾지 못하면 에러를 던진다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ resultSet: { result: [{}] } }))
    );

    const tool = createGetPriceInfoTool();

    await expect(tool.handler({ productId: 'notfound' })).rejects.toThrow(
      '상품을 찾을 수 없습니다: notfound'
    );
  });

  it('productName으로 찾지 못할 때 에러 메시지에 productName을 포함한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ resultSet: { result: [{}] } }))
    );

    const tool = createGetPriceInfoTool();

    await expect(tool.handler({ productName: '없는상품' })).rejects.toThrow(
      '상품을 찾을 수 없습니다: 없는상품'
    );
  });

  it('EXH_PD_NM을 대체 이름으로 사용한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '',
      EXH_PD_NM: '대체이름',
      PD_PRC: '2000',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.productName).toBe('대체이름');
  });

  it('가격이 숫자가 아니면 0으로 처리한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '테스트',
      PD_PRC: 'invalid',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.currentPrice).toBe(0);
  });

  it('품절 상품을 처리한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '품절상품',
      PD_PRC: '5000',
      SOLD_OUT_YN: 'Y',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.soldOut).toBe(true);
  });

  it('브랜드가 없으면 undefined로 설정한다', async () => {
    const product = {
      PD_NO: '12345',
      PDNM: '테스트',
      PD_PRC: '1000',
      BRND_NM: '',
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockProductResponse([product])))
    );

    const tool = createGetPriceInfoTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.brand).toBeUndefined();
  });
});
