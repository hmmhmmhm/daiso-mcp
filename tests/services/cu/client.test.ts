/**
 * CU 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCuStock,
  fetchCuStores,
  geocodeCuAddress,
  primeCuStockDisplay,
} from '../../../src/services/cu/client.js';

const mockFetch = vi.fn();

it('CU 조회 실패 응답을 빈 재고로 처리하지 않는다', async () => {
  mockFetch.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(
    JSON.stringify({ resp_cd: '3000', resp_msg: '재고조회 조회 실패' }),
  ));
  await expect(fetchCuStock({ keyword: '과자', limit: 1, offset: 0, searchSort: 'recom' }))
    .rejects.toThrow('CU 재고 API가 조회 실패 응답을 반환했습니다 (3000).');
});

it('재고 HTML 응답은 빈 재고 성공 대신 사용 불가로 반환한다', async () => {
  mockFetch
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response('\r\n<!DOCTYPE html><html>upstream page</html>'));
  const result = await fetchCuStock({ keyword: '과자', limit: 1, offset: 0, searchSort: 'recom' });
  expect(result).toMatchObject({
    available: false,
    unavailableReason: 'CU 재고 API가 JSON 대신 HTML을 반환하여 재고를 확인할 수 없습니다.',
    items: [],
  });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetchCuStores', () => {
  it('좌표 없이 키워드만 있으면 웹 매장 검색으로 조회한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        `
        <table>
          <tbody>
            <tr>
              <td>
                <span class="name">안산중앙역에코점</span>
                <span class="tel">031-000-0000</span>
              </td>
              <td>
                <div class="detail_info">
                  <address>
                    <a href="#" onClick="searchLatLng('경기도 안산시 단원구 중앙대로 885', '48806'); return false;">
                      경기도 안산시 단원구 중앙대로 885
                    </a>
                  </address>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        `,
      ),
    );

    const result = await fetchCuStores({ searchWord: '안산 중앙역' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://cu.bgfretail.com/store/list_Ajax.do?'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0',
        }),
      }),
    );
    const [requestUrl, requestOptions] = mockFetch.mock.calls[0];
    expect(Object.fromEntries(new URL(requestUrl).searchParams)).toEqual({
      pageIndex: '1', listType: '', jumpoCode: '', jumpoLotto: '', jumpoToto: '',
      jumpoCash: '', jumpoHour: '', jumpoCafe: '', jumpoDelivery: '', jumpoBakery: '',
      jumpoFry: '', jumpoMultiDevice: '', jumpoPosCash: '', jumpoBattery: '',
      jumpoAdderss: '', jumpoSido: '', jumpoGugun: '', jumpodong: '', searchWord: '안산 중앙역',
    });
    expect(requestOptions.body).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.totalCount).toBe(1);
    expect(result.stores[0]).toEqual(
      expect.objectContaining({
        storeCode: '48806',
        storeName: '안산중앙역에코점',
        address: '경기도 안산시 단원구 중앙대로 885',
      }),
    );
  });

  it('웹 매장 검색 응답이 실패하면 에러를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response('fail', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await expect(fetchCuStores({ searchWord: '안산 중앙역' })).rejects.toThrow(
      'API 요청 실패: 500 Internal Server Error',
    );
  });

  it('웹 매장 검색에서 이름 없는 행은 제외한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        `
        <table>
          <tbody>
            <tr>
              <td><span class="tel">031-111-1111</span></td>
            </tr>
            <tr>
              <td><span class="name">안산중앙점</span></td>
            </tr>
          </tbody>
        </table>
        `,
      ),
    );

    const result = await fetchCuStores({ searchWord: '안산' });
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0].storeName).toBe('안산중앙점');
  });

  it('HTML 엔티티를 1회만 디코딩한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        `
        <table>
          <tbody>
            <tr>
              <td>
                <span class="name">A&amp;lt;B</span>
                <span class="tel">02&nbsp;1234</span>
              </td>
              <td>
                <div class="detail_info">
                  <address>
                    <a href="#" onClick="searchLatLng('서울시 강남구', '10001'); return false;">
                      서울시&nbsp;강남구
                    </a>
                  </address>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        `,
      ),
    );

    const result = await fetchCuStores({ searchWord: '강남' });

    expect(result.totalCount).toBe(1);
    expect(result.stores[0].storeName).toBe('A&lt;B');
    expect(result.stores[0].phone).toBe('02 1234');
    expect(result.stores[0].address).toBe('서울시 강남구');
  });

  it('CU 매장 목록을 정규화해서 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          storeList: [
            {
              storeCd: '28376',
              storeNm: '중앙하이츠빌점',
              storeTelNo: '0315088023',
              addrFst: '경기도 안산시 단원구 안산천서로',
              addrDetail: '23 중앙하이츠빌 1층',
              latVal: 37.318482,
              longVal: 126.841838,
              distance: 97,
              stock: '10',
              deliveryPickYn: 'Y',
              jumpoPickYn: 'N',
              reserveYn: 'N',
            },
          ],
        }),
      ),
    );

    const result = await fetchCuStores({ latitude: 37.5, longitude: 127.0, searchWord: '강남' });

    expect(result.totalCount).toBe(1);
    expect(result.stores[0]).toEqual(
      expect.objectContaining({
        storeCode: '28376',
        storeName: '중앙하이츠빌점',
        stock: 10,
        deliveryYn: true,
      }),
    );
  });

  it('기본 헤더와 POST 요청을 사용한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    await fetchCuStores({ latitude: 37.5, longitude: 127.0 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.pocketcu.co.kr/api/store',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      }),
    );
  });

  it('재고 시드 파라미터를 매장 조회 payload에 반영한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    await fetchCuStores({
      latitude: 37.3177,
      longitude: 126.8412,
      itemCd: '2202000140047',
      onItemNo: '2026020061628',
      jipCd: '2202000140047',
      isRecommend: 'Y',
      recommendId: 'stock',
      pageType: 'search_improve stock_sch_improve',
    });

    const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.itemCd).toBe('2202000140047');
    expect(body.onItemNo).toBe('2026020061628');
    expect(body.jipCd).toBe('2202000140047');
    expect(body.isRecommend).toBe('Y');
    expect(body.recommendId).toBe('stock');
    expect(body.pageType).toBe('search_improve stock_sch_improve');
  });

  it('도로명 주소와 boolean YN 값을 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          storeList: [
            {
              storeCd: '100',
              storeNm: '도로명점',
              doroStoreAddr1: '서울특별시 강남구',
              doroStoreAddr2: '테헤란로 123',
              deliveryYn: true,
              jumpoPickYn: false,
              reserveYn: true,
            },
          ],
        }),
      ),
    );

    const result = await fetchCuStores({ latitude: 37.5, longitude: 127.0 });

    expect(result.stores[0].address).toBe('서울특별시 강남구 테헤란로 123');
    expect(result.stores[0].deliveryYn).toBe(true);
    expect(result.stores[0].pickupYn).toBe(false);
    expect(result.stores[0].reserveYn).toBe(true);
  });

  it('storeList/totalCnt 누락 시 기본값을 사용한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({})));

    const result = await fetchCuStores({ latitude: 37.5, longitude: 127.0 });

    expect(result.totalCount).toBe(0);
    expect(result.stores).toEqual([]);
  });

  it('매장명이 없으면 빈 문자열로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          storeList: [{ storeCd: 'x1' }],
        }),
      ),
    );

    const result = await fetchCuStores({ latitude: 37.5, longitude: 127.0 });
    expect(result.stores[0].storeName).toBe('');
  });

  it('비정상 숫자/문자 값은 0으로 보정하고 storeCode 기본값을 사용한다', async () => {
    mockFetch.mockResolvedValue(new Response(
      '{"totalCnt":1,"storeList":[{"storeNm":"테스트점","latVal":1e400,"longVal":-1e400,"stock":"abc"}]}',
    ));

    const result = await fetchCuStores({ latitude: 37.5, longitude: 127.0 });

    expect(result.stores[0].storeCode).toBe('');
    expect(result.stores[0].latitude).toBe(0);
    expect(result.stores[0].longitude).toBe(0);
    expect(result.stores[0].stock).toBe(0);
  });
});

describe('primeCuStockDisplay', () => {
  it('재고 초기화 API를 호출한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ areaList: [] })));

    await primeCuStockDisplay();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.pocketcu.co.kr/api/search/display/stock',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('공식 앱 식별자가 포함된 User-Agent를 전송한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ areaList: [] })));

    await primeCuStockDisplay();

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const userAgent = new Headers(options.headers).get('user-agent') || '';
    expect(userAgent).toMatch(/;BGFCU$/);
  });
});

describe('fetchCuStock', () => {

  it('원본 500 오류는 unavailable로 숨기지 않는다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(new Response('origin error', { status: 500 }));

    await expect(
      fetchCuStock(
        { keyword: '과자', limit: 1, offset: 0, searchSort: 'recom' },
        { apiKey: 'test-key' },
      ),
    ).rejects.toThrow('API 요청 실패: 500');
  });

  it('재고 검색 결과를 정규화해서 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'Y',
            data: {
              stockResult: {
                result: {
                  total_count: 2,
                  rows: [
                    {
                      fields: {
                        item_cd: '8801',
                        on_item_no: '2026020061628',
                        item_nm: '감자칩',
                        hyun_maega: '1700',
                        pickup_yn: 'Y',
                        deliv_yn: 'N',
                        reserv_yn: 'N',
                      },
                    },
                    {
                      fields: {
                        item_cd: '8802',
                        item_nm: '초코바',
                        hyun_maega: 1200,
                        pickup_yn: 'N',
                        deliv_yn: 'Y',
                        reserv_yn: 'Y',
                      },
                    },
                  ],
                },
              },
            },
          }),
        ),
      );

    const result = await fetchCuStock({ keyword: '과자', limit: 8, offset: 0, searchSort: 'recom' });

    expect(result.totalCount).toBe(2);
    expect(result.spellModifyYn).toBe('Y');
    expect(result.items[0].price).toBe(1700);
    expect(result.items[0].onItemNo).toBe('2026020061628');
    expect(result.items[1].reserveYn).toBe(true);
  });

  it('display 호출이 실패해도 메인 검색을 시도한다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('display fail'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      );

    const result = await fetchCuStock({ keyword: '과자', limit: 8, offset: 0, searchSort: 'recom' });

    expect(result.totalCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('검색 결과 구조가 비어있으면 기본값을 사용한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })));

    const result = await fetchCuStock({ keyword: '과자', limit: 8, offset: 0, searchSort: 'recom' });

    expect(result.totalCount).toBe(0);
    expect(result.spellModifyYn).toBe('N');
    expect(result.items).toEqual([]);
  });

  it('아이템 필드 누락 시 기본값을 사용한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: {
              stockResult: {
                result: {
                  total_count: 1,
                  rows: [{ fields: {} }],
                },
              },
            },
          }),
        ),
      );

    const result = await fetchCuStock({ keyword: '과자', limit: 8, offset: 0, searchSort: 'recom' });

    expect(result.items[0].itemCode).toBe('');
    expect(result.items[0].onItemNo).toBe('');
    expect(result.items[0].itemName).toBe('');
  });
});

describe('geocodeCuAddress', () => {
  it('Google Geocoding 성공 시 좌표를 반환한다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ documents: [{ place_name: '서울시 강남구', address_name: '경기도 안산시 단원구 중앙대로 885', y: 37.3172188, x: 126.8354271 }] }),
      ),
    );

    const result = await geocodeCuAddress('경기도 안산시 단원구 중앙대로 885', {
      kakaoRestApiKey: 'test-google-key',
    });

    expect(result).toEqual({ latitude: 37.3172188, longitude: 126.8354271 });
  });

  it('API 키가 없으면 null을 반환한다', async () => {
    const result = await geocodeCuAddress('경기도 안산시 단원구 중앙대로 885');
    expect(result).toBeNull();
  });

  it('빈 주소면 null을 반환한다', async () => {
    const result = await geocodeCuAddress('   ', {
      kakaoRestApiKey: 'test-google-key',
    });
    expect(result).toBeNull();
  });

  it('status가 OK가 아니면 null을 반환한다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ documents: [] }),
      ),
    );

    const result = await geocodeCuAddress('없는주소', {
      kakaoRestApiKey: 'test-google-key',
    });
    expect(result).toBeNull();
  });

  it('좌표 결과가 없으면 null을 반환한다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ documents: [] }),
      ),
    );

    const result = await geocodeCuAddress('경기도 안산시 단원구 중앙대로 885', {
      kakaoRestApiKey: 'test-google-key',
    });
    expect(result).toBeNull();
  });

  it('좌표값이 0이면 null을 반환한다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ documents: [{ place_name: '서울시 강남구', address_name: '경기도 안산시 단원구 중앙대로 885', y: 0, x: 127.0 }] }),
      ),
    );

    const result = await geocodeCuAddress('경기도 안산시 단원구 중앙대로 885', {
      kakaoRestApiKey: 'test-google-key',
    });
    expect(result).toBeNull();
  });
});

it.each([[400, 'Bad Request'], [403, 'Forbidden'], [429, 'Too Many Requests']] as const)('웹 매장 %i 차단 후 유료 호출 없이 원본 오류를 반환한다', async (status, statusText) => {
  mockFetch.mockResolvedValueOnce(new Response('blocked', { status, statusText }));
  await expect(fetchCuStores({ searchWord: '강남' }, { apiKey: 'remaining-key' }))
    .rejects.toThrow(`API 요청 실패: ${status} ${statusText}`);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(String(mockFetch.mock.calls[0][0])).toContain('cu.bgfretail.com');
});

it('재고 원본 차단 후 Zyte 요청을 보내지 않는다', async () => {
  mockFetch.mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response('blocked', { status: 403 }));
  await expect(fetchCuStock({ keyword: '과자', limit: 1, offset: 0, searchSort: 'recom' }, { apiKey: 'remaining-key' }))
    .resolves.toMatchObject({
      available: false,
      unavailableReason: expect.stringContaining('403 Request Blocked'),
      items: [],
    });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(mockFetch.mock.calls.every(([url]) => new URL(String(url)).hostname !== 'api.zyte.com')).toBe(true);
});

it.each([400, 403, 429])('키가 없는 재고 원본 %i 차단은 조회 불가로 표시한다', async (status) => {
  mockFetch.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('blocked', { status }));
  const result = await fetchCuStock({ keyword: '과자', limit: 1, offset: 0, searchSort: 'recom' });
  expect(result.available).toBe(false);
  expect(result.unavailableReason).toContain(`${status} Request Blocked`);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

it.each([
  ['서울특별시 강남구 테헤란로63길 9 1층 105호', '서울특별시 강남구 테헤란로63길 9', '서울 강남구 테헤란로63길 9'],
  ['서울특별시 강남구 도산대로 529 KRA프라자 (청담동) KRA프라자', '서울특별시 강남구 도산대로 529', '서울 강남구 도산대로 529'],
  ['서울특별시 강남구 논현로 201 (도곡동)', '서울특별시 강남구 논현로 201', '서울 강남구 논현로 201'],
  ['경기도 성남시 분당구 정자동 12-3 2층 201호', '경기도 성남시 분당구 정자동 12-3', '경기 성남시 분당구 정자동 12-3'],
])('CU 상세 주소의 건물 위치만 요청하되 도로·건물 번호를 보존한다 (%s)', async (address, query, canonical) => {
  mockFetch.mockResolvedValue(Response.json({ documents: [{ x: '127.03', y: '37.5', address_name: canonical }] }));
  expect(await geocodeCuAddress(address, { kakaoRestApiKey: 'test-key' })).toEqual({ latitude: 37.5, longitude: 127.03 });
  expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe(query);
});
it.each(['서울 강남구 테헤란로64길 9', '서울 강남구 테헤란로63길 10', '서울 서초구 테헤란로63길 9'])('CU 상세 주소도 다른 도로·건물·지역을 거절한다 (%s)', async (canonical) => {
  mockFetch.mockResolvedValue(Response.json({ documents: [{ x: '127.03', y: '37.5', address_name: canonical }] }));
  expect(await geocodeCuAddress('서울특별시 강남구 테헤란로63길 9 1층 105호', { kakaoRestApiKey: 'test-key' })).toBeNull();
});
it('CU 위치를 확인할 수 없는 주소는 원문을 그대로 조회한다', async () => {
  mockFetch.mockResolvedValue(Response.json({ documents: [] }));
  expect(await geocodeCuAddress('알수없는 건물 105호', { kakaoRestApiKey: 'test-key' })).toBeNull();
  expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe('알수없는 건물 105호');
});
it('CU 주소에 두 도로 번호가 함께 있으면 임의로 첫 위치만 선택하지 않는다', async () => {
  mockFetch.mockResolvedValue(Response.json({ documents: [] }));
  const address = '서울특별시 강남구 테헤란로63길 9 강남대로 111';
  expect(await geocodeCuAddress(address, { kakaoRestApiKey: 'test-key' })).toBeNull();
  expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe(address);
});
it.each([
  '서울특별시 강남구 테헤란로63길 9 (서울특별시 서초구 강남대로 111)',
  '서울특별시 강남구 테헤란로63길 9 (경기도 성남시 분당구 정자동 12-3)',
])('CU 괄호 안의 다른 도로·지번 주소를 상세 정보로 제거하지 않는다 (%s)', async (address) => {
  mockFetch.mockResolvedValue(Response.json({ documents: [{ x: '127.03', y: '37.5', address_name: '서울 강남구 테헤란로63길 9' }] }));
  expect(await geocodeCuAddress(address, { kakaoRestApiKey: 'test-key' })).toBeNull();
  expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe(address);
});
it('CU 주소의 인식할 수 없는 숫자 상세는 원문에 남긴다', async () => {
  const address = '서울특별시 강남구 테헤란로63길 9 105';
  mockFetch.mockResolvedValue(Response.json({ documents: [{ x: '127.03', y: '37.5', address_name: '서울 강남구 테헤란로63길 9' }] }));
  expect(await geocodeCuAddress(address, { kakaoRestApiKey: 'test-key' })).toBeNull();
  expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe(address);
});
