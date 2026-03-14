/**
 * 롯데마트 클라이언트 예외 분기 테스트
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
import { LOTTEMART_AREAS } from '../../../src/services/lottemart/api.js';

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

describe('fetchLotteMartStoresByArea 예외 처리', () => {
  it('매장 옵션 조회에서 빈 지역이면 에러를 던진다', async () => {
    await expect(fetchLotteMartMarketOptions('', '1')).rejects.toThrow(
      '지원하지 않는 지역입니다: ',
    );
  });

  it('지원하지 않는 지역이면 에러를 던진다', async () => {
    await expect(fetchLotteMartStoresByArea('없는지역')).rejects.toThrow(
      '지원하지 않는 지역입니다: 없는지역',
    );
  });

  it('동일 지역 재조회 시 캐시된 매장을 반환한다', async () => {
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
                  <li><span>주소 : </span> 서울 광진구 광나루로 56길 85</li>
                  <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                </ul>
              </div>
              <a class="link" href="./detail_shop.asp?werks=2301"></a>
            </li>
          </ul>
        </section>
      `),
      );

    const first = await fetchLotteMartStoresByArea('서울');
    const second = await fetchLotteMartStoresByArea('서울');

    expect(first).toBe(second);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('명시된 세션 쿠키가 있으면 그대로 사용한다', async () => {
    mockFetch.mockResolvedValue(new Response('<option value="2301">강변점</option>'));

    const result = await fetchLotteMartMarketOptions('서울', '1', {
      sessionCookie: 'ASPSESSIONID=MANUAL',
    });

    expect(result[0]?.storeCode).toBe('2301');
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Cookie')).toBe('ASPSESSIONID=MANUAL');
  });

  it('빈 바디와 세션 쿠키를 받으면 같은 요청을 재시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'));

    const result = await fetchLotteMartMarketOptions('서울', '1');

    expect(result[0]?.storeCode).toBe('2301');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('geocodeLotteMartAddress 예외 분기', () => {
  it('빈 주소는 null을 반환하고 요청하지 않는다', async () => {
    await expect(geocodeLotteMartAddress('   ', { googleMapsApiKey: 'test-key' })).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('좌표가 없는 정상 응답은 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{ geometry: {} }],
        }),
      ),
    );

    await expect(
      geocodeLotteMartAddress('좌표없는주소', {
        googleMapsApiKey: 'test-key',
      }),
    ).resolves.toBeNull();
  });

  it('지오코딩 실패 응답은 null로 캐시한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      ),
    );

    const first = await geocodeLotteMartAddress('결과없는주소', {
      googleMapsApiKey: 'test-key',
    });
    const second = await geocodeLotteMartAddress('결과없는주소', {
      googleMapsApiKey: 'test-key',
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchLotteMartStores 보조 분기', () => {
  it('키워드 지오코딩에 실패하면 좌표 없이 조회를 계속한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ZERO_RESULTS',
            results: [],
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

    expect(result.geocodeUsed).toBe(false);
    expect(result.location).toBeNull();
    expect(result.stores[0].storeName).toBe('강변점');
  });

  it('매장 좌표가 이미 있으면 거리 계산만 수행한다', async () => {
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
                  <li><span>주소 : </span> 서울 광진구 광나루로 56길 85</li>
                  <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                </ul>
              </div>
              <a class="link" href="./detail_shop.asp?werks=2301"></a>
            </li>
          </ul>
        </section>
      `),
      );

    const cachedStores = await fetchLotteMartStoresByArea('서울');
    cachedStores[0].latitude = 37.5354;
    cachedStores[0].longitude = 127.0958;

    const result = await fetchLotteMartStores({
      area: '서울',
      latitude: 37.536,
      longitude: 127.096,
      limit: 1,
    });

    expect(result.stores[0].distanceM).toBeTypeOf('number');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('지역이 없으면 전체 지역을 조회하고 좌표 없이 결과를 반환한다', async () => {
    mockFetch.mockImplementation(() => {
      return Promise.resolve(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">공통점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 전국 공통 주소</li>
                    <li><span>상담전화 : </span><a onclick="goClick('9001');">02-0000-0000</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=9001"></a>
              </li>
            </ul>
          </section>
        `),
      );
    });

    const result = await fetchLotteMartStores({ limit: 2 });

    expect(mockFetch).toHaveBeenCalledTimes(LOTTEMART_AREAS.length);
    expect(result.location).toBeNull();
    expect(result.geocodeUsed).toBe(false);
    expect(result.stores).toHaveLength(2);
    expect(result.stores.every((store) => store.distanceM === null)).toBe(true);
  });

  it('매장 주소 지오코딩에 실패하면 원본 매장을 유지한다', async () => {
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
            status: 'ZERO_RESULTS',
            results: [],
          }),
        ),
      );

    const result = await fetchLotteMartStores(
      {
        area: '서울',
        latitude: 37.5354,
        longitude: 127.0958,
      },
      {
        googleMapsApiKey: 'test-key',
      },
    );

    expect(result.stores[0].latitude).toBe(0);
    expect(result.stores[0].distanceM).toBeNull();
  });
});

describe('resolveLotteMartStore 보조 분기', () => {
  it('storeName 완전 일치로 매장을 찾는다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'));

    await expect(resolveLotteMartStore('서울', undefined, '강변점')).resolves.toEqual(
      expect.objectContaining({
        storeCode: '2301',
      }),
    );
  });

  it('storeName이 일치하지 않으면 null을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'));

    await expect(resolveLotteMartStore('서울', undefined, '없는점')).resolves.toBeNull();
  });

  it('storeCode와 storeName이 모두 없으면 null을 반환한다', async () => {
    await expect(resolveLotteMartStore(undefined, undefined, undefined)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('searchLotteMartProducts 예외 처리', () => {
  it('빈 상품 검색어는 에러를 던진다', async () => {
    await expect(
      searchLotteMartProducts({
        area: '서울',
        storeCode: '2301',
        keyword: '   ',
      }),
    ).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('검색 대상 매장을 찾지 못하면 에러를 던진다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="9999">잠실점</option>'));

    await expect(
      searchLotteMartProducts({
        area: '서울',
        storeCode: '2301',
        keyword: '콜라',
      }),
    ).rejects.toThrow(
      '검색할 롯데마트 매장을 찾지 못했습니다. area와 storeCode/storeName을 확인해주세요.',
    );
  });

  it('pageLimit이 0이면 기본 페이지 제한값을 사용한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'))
      .mockResolvedValueOnce(
        new Response(`
          <!doctype html>
          <div class="total-num">검색결과 : <span>2</span>건</div>
          <script>var totalPage = "2";</script>
          <ul class="list-result">
            <li>
              <div class="prod-box">
                <div class="prod-name">코카콜라</div>
                <div class="prod-count">1.5L</div>
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
          </li>
        `),
      );

    const result = await searchLotteMartProducts({
      area: '서울',
      storeCode: '2301',
      keyword: '콜라',
      pageLimit: 0,
    });

    expect(result.products).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
