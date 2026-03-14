/**
 * 롯데마트 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteMartCaches } from '../../src/services/lottemart/client.js';
import { handleLotteMartFindStores, handleLotteMartSearchProducts } from '../../src/api/lottemartHandlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearLotteMartCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {
      GOOGLE_MAPS_API_KEY: 'test-key',
    },
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleLotteMartFindStores>[0];
}

describe('handleLotteMartFindStores', () => {
  it('매장 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">강변점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 서울 광진구 광나루로 56길 85</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2301"></a>
              </li>
            </ul>
          </section>
        `),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5354, lng: 127.0958 } } }],
          }),
        ),
      );

    const ctx = createMockContext({ area: '서울', lat: '37.5354', lng: '127.0958' });
    await handleLotteMartFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          stores: expect.any(Array),
        }),
      }),
    );
  });

  it('예외 발생 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('store fail'));

    const ctx = createMockContext({ area: '잘못된지역' });
    await handleLotteMartFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'LOTTEMART_STORE_SEARCH_FAILED', message: '지원하지 않는 지역입니다: 잘못된지역' },
      }),
      500,
    );
  });
});

describe('handleLotteMartSearchProducts', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleLotteMartSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('store 정보가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({ keyword: '콜라' });
    await handleLotteMartSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_STORE', message: 'storeCode 또는 storeName 중 하나를 입력해주세요.' },
      }),
      400,
    );
  });

  it('상품 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'))
      .mockResolvedValueOnce(
        new Response(`
          <!doctype html>
          <div class="total-num">검색결과 : <span>1</span>건</div>
          <script>var totalPage = "1";</script>
          <ul class="list-result">
            <li>
              <div class="prod-box">
                <div class="prod-name">코카콜라</div>
                <div class="prod-count">1.2L</div>
              </div>
              <div class="layer_wrap">
                <div class="layer_popup">
                  <div class="layer-head">코카콜라</div>
                  <table><tbody>
                    <tr><th>ㆍ제조사 :</th><td>코카콜라음료 주식회사</td></tr>
                    <tr><th>ㆍ가격 : </th><td>2,980 원</td></tr>
                    <tr><th>ㆍ재고 : </th><td>20 개</td></tr>
                  </tbody></table>
                  <div class="layer-foot"><span>닫기</span></div>
                </div>
              </div>
            </li>
          </ul>
        `),
      );

    const ctx = createMockContext({ area: '서울', storeName: '강변점', keyword: '콜라' });
    await handleLotteMartSearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          storeName: '강변점',
          products: expect.any(Array),
        }),
      }),
    );
  });
});
