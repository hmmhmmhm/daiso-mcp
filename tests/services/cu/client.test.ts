/**
 * CU 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCuStock, fetchCuStores, primeCuStockDisplay } from '../../../src/services/cu/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
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
      'https://cu.bgfretail.com/store/list_Ajax.do',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      }),
    );
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

  it('웹 검색이 400이면 Zyte로 재시도해 결과를 반환한다', async () => {
    const zyteBody = Buffer.from(
      `
      <table>
        <tbody>
          <tr>
            <td><span class="name">안산중앙역에코점</span></td>
          </tr>
        </tbody>
      </table>
      `,
      'utf8',
    ).toString('base64');

    mockFetch
      .mockResolvedValueOnce(
        new Response('bad request', {
          status: 400,
          statusText: 'Bad Request',
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
            httpResponseBody: zyteBody,
          }),
        ),
      );

    const result = await fetchCuStores(
      { searchWord: '안산 중앙역' },
      {
        apiKey: 'test-key',
      },
    );

    expect(result.totalCount).toBe(1);
    expect(result.stores[0].storeName).toBe('안산중앙역에코점');
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.zyte.com/v1/extract', expect.any(Object));
  });

  it('웹 검색 400 + Zyte 실패 시 원본 에러를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response('bad request', {
          status: 400,
          statusText: 'Bad Request',
        }),
      )
      .mockRejectedValueOnce(new Error('zyte fail'));

    await expect(fetchCuStores({ searchWord: '안산 중앙역' }, { apiKey: 'test-key' })).rejects.toThrow(
      'API 요청 실패: 400 Bad Request',
    );
  });

  it('웹 검색 400 + Zyte 본문 누락 시 원본 에러를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response('bad request', {
          status: 400,
          statusText: 'Bad Request',
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
          }),
        ),
      );

    await expect(fetchCuStores({ searchWord: '안산 중앙역' }, { apiKey: 'test-key' })).rejects.toThrow(
      'API 요청 실패: 400 Bad Request',
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        totalCnt: 1,
        storeList: [
          {
            storeNm: '테스트점',
            latVal: Number.POSITIVE_INFINITY,
            longVal: Number.NaN,
            stock: 'abc',
          },
        ],
      }),
    } as unknown as Response);

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
});

describe('fetchCuStock', () => {
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
