/**
 * 롯데마트 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearLotteMartCaches,
  fetchLotteMartMarketOptions,
  fetchLotteMartStores,
  fetchLotteMartStoresByArea,
  geocodeLotteMartAddress,
  resolveLotteMartStore,
  searchLotteMartProducts,
} from '../../../src/services/lottemart/client.js';

const mockFetch = vi.fn();
const createSessionResponse = () => new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=TEST; path=/' } });

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearLotteMartCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchLotteMartMarketOptions', () => {
  it('지역별 매장 옵션을 파싱한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(
        new Response('<option value="">매장선택</option><option value="2301">강변점</option>'),
      );

    const result = await fetchLotteMartMarketOptions('서울', '2');

    expect(result).toEqual([
      {
        area: '서울',
        storeCode: '2301',
        storeName: '강변점',
        brandVariant: 'lottemart',
      },
    ]);
  });

  it('제주 입력을 기타 지역 코드로 변환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2901">제주점</option>'));

    await fetchLotteMartMarketOptions('제주', '2');

    expect(String(mockFetch.mock.calls[1][0])).toContain('p_area=%EA%B8%B0%ED%83%80');
  });
});

describe('fetchLotteMartStoresByArea', () => {
  it('지역 전체 매장 상세를 파싱한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(
        new Response(`
        <!doctype html>
        <section class="sub-wrap result-shop-list">
          <ul class="list-result">
            <li>
              <div class="shop-tit">강변점</div>
              <div class="shop-desc">
                <ul>
                  <li><span>영업시간 : </span> 10:00~23:00</li>
                  <li><span>휴점일 : </span> 03/08(일), 03/22(일)</li>
                  <li><span>주소 : </span> 서울 광진구 광나루로 56길 85 테크노마트 B2</li>
                  <li><span>상담전화 : </span><a href="tel:02-3424-2502" onclick="goClick('2301');">02-3424-2502</a></li>
                  <li><span>주차정보 : 유료</span><div class="park-info">최초 무료주차 : 1시간</div></li>
                </ul>
              </div>
              <a class="link" href="./detail_shop.asp?werks=2301"><span>층별안내</span></a>
            </li>
          </ul>
        </section>
      `),
      );

    const result = await fetchLotteMartStoresByArea('서울');

    expect(result[0]).toEqual(
      expect.objectContaining({
        area: '서울',
        storeCode: '2301',
        storeName: '강변점',
        phone: '02-3424-2502',
        address: '서울 광진구 광나루로 56길 85 테크노마트 B2',
        parkingType: '유료',
      }),
    );
  });
});

describe('geocodeLotteMartAddress', () => {
  it('API 키가 없으면 null을 반환한다', async () => {
    const result = await geocodeLotteMartAddress('서울 강남구');
    expect(result).toBeNull();
  });

  it('지오코딩 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{ geometry: { location: { lat: 37.5, lng: 127.0 } } }],
        }),
      ),
    );

    const result = await geocodeLotteMartAddress('서울 강남구', {
      googleMapsApiKey: 'test-key',
    });

    expect(result).toEqual({ latitude: 37.5, longitude: 127.0 });
  });
});

describe('fetchLotteMartStores', () => {
  it('주소 지오코딩으로 거리순 매장을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">강변점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 서울 광진구 광나루로 56길 85 테크노마트 B2</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2301"></a>
              </li>
              <li>
                <div class="shop-tit">맥스 금천점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 서울 금천구 시흥대로291</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2101');">02-2109-7661</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2101"></a>
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.4579, lng: 126.8956 } } }],
          }),
        ),
      );

    const result = await fetchLotteMartStores(
      {
        area: '서울',
        latitude: 37.5354,
        longitude: 127.0958,
        brandVariant: 'lottemart',
      },
      {
        googleMapsApiKey: 'test-key',
      },
    );

    expect(result.location).toEqual({ latitude: 37.5354, longitude: 127.0958 });
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0].storeCode).toBe('2301');
    expect(result.stores[0].distanceM).toBe(0);
  });

  it('키워드 지오코딩을 사용한 뒤 키워드로 매장을 필터링한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5, lng: 127.0 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(createSessionResponse())
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
            results: [{ geometry: { location: { lat: 37.51, lng: 127.01 } } }],
          }),
        ),
      );

    const result = await fetchLotteMartStores(
      {
        area: '서울',
        keyword: '강변',
      },
      {
        googleMapsApiKey: 'test-key',
      },
    );

    expect(result.geocodeUsed).toBe(true);
    expect(result.stores[0].storeName).toBe('강변점');
  });

  it('지역 없이 역명 키워드를 받으면 일치 매장을 찾을 때까지 순차 조회한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === 'https://company.lottemart.com/mobiledowa/') {
        return Promise.resolve(createSessionResponse());
      }

      const body = String(init?.body || '');
      if (body.includes('m_area=%EA%B2%BD%EA%B8%B0')) {
        return Promise.resolve(
          new Response(`
            <section class="sub-wrap result-shop-list">
              <ul class="list-result">
                <li>
                  <div class="shop-tit">안산점</div>
                  <div class="shop-desc">
                    <ul>
                      <li><span>주소 : </span> 경기 안산시 상록구 항가울로 422</li>
                      <li><span>상담전화 : </span><a onclick="goClick('2415');">031-000-0000</a></li>
                    </ul>
                  </div>
                  <a class="link" href="./detail_shop.asp?werks=2415"></a>
                </li>
              </ul>
            </section>
          `),
        );
      }

      return Promise.resolve(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result"></ul>
          </section>
        `),
      );
    });

    const result = await fetchLotteMartStores({
      keyword: '안산 중앙역',
      limit: 1,
    });

    expect(result.stores.map((store) => store.storeCode)).toEqual(['2415']);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('resolveLotteMartStore', () => {
  it('storeCode로 매장을 찾는다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'));

    const result = await resolveLotteMartStore('서울', '2301', undefined);

    expect(result?.storeName).toBe('강변점');
  });

  it('storeName 부분 일치로 매장을 찾는다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'));

    const result = await resolveLotteMartStore('서울', undefined, '강변');

    expect(result?.storeCode).toBe('2301');
  });
});

describe('searchLotteMartProducts', () => {
  it('초기 페이지와 추가 페이지를 합쳐 상품을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'))
      .mockResolvedValueOnce(
        new Response(`
          <-schWord<br>콜라
          <!doctype html>
          <div class="total-num">검색결과 : <span>3</span>건</div>
          <script>var totalPage = "2";</script>
          <ul class="list-result">
            <li>
              <div class="prod-box">
                <div class="prod-name">코카콜라</div>
                <div class="prod-count"><!--8801094011307-->1.2L</div>
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
      )
      .mockResolvedValueOnce(
        new Response(`
          <li>
            <div class="prod-box">
              <div class="prod-name">펩시콜라</div>
              <div class="prod-count">600ML</div>
            </div>
            <div class="layer_wrap">
              <div class="layer_popup">
                <div class="layer-head">펩시콜라</div>
                <table><tbody>
                  <tr><th>ㆍ제조사 :</th><td>롯데칠성음료 (주)</td></tr>
                  <tr><th>ㆍ가격 : </th><td>1,680 원</td></tr>
                  <tr><th>ㆍ재고 : </th><td>180 개</td></tr>
                </tbody></table>
                <div class="layer-foot"><span>닫기</span></div>
              </div>
            </div>
          </li>
        `),
      );

    const result = await searchLotteMartProducts({
      area: '서울',
      storeName: '강변점',
      keyword: '콜라',
      pageLimit: 2,
    });

    expect(result.storeCode).toBe('2301');
    expect(result.totalCount).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.products).toHaveLength(2);
    expect(result.products[0].barcode).toBe('8801094011307');
  });

  it('역명 키워드를 붙여쓴 변형으로도 매장을 찾는다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">안산점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 경기 안산시 단원구 고잔동 000</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2415');">031-000-0000</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2415"></a>
              </li>
            </ul>
          </section>
        `),
      );

    const result = await fetchLotteMartStores({
      area: '경기',
      keyword: '안산 중앙역',
    });

    expect(result.stores[0].storeCode).toBe('2415');
  });

  it('다중 토큰 키워드에서 과하게 넓은 부분 일치를 줄인다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">안산점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 경기 안산시 상록구 항가울로 422</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2415');">031-000-0000</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2415"></a>
              </li>
              <li>
                <div class="shop-tit">주엽점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 경기 고양시 일산서구 중앙로 1496</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2403');">031-111-1111</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2403"></a>
              </li>
            </ul>
          </section>
        `),
      );

    const result = await fetchLotteMartStores({
      area: '경기',
      keyword: '안산 중앙역',
    });

    expect(result.stores.map((store) => store.storeCode)).toEqual(['2415']);
  });
});
