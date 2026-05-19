/**
 * CU API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCuCheckInventory, handleCuFindStores } from '../../src/api/handlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {},
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleCuFindStores>[0];
}

function createMockContextWithEnv(query: Record<string, string>, env: Record<string, string>) {
  return {
    env,
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleCuFindStores>[0];
}

describe('handleCuFindStores', () => {
  it('keyword-only CU 매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        `
        <table>
          <tbody>
            <tr>
              <td>
                <span class="name">안산중앙역에코점</span>
              </td>
              <td>
                <address><a href="#" onClick="searchLatLng('경기도 안산시', '48806'); return false;">경기도 안산시</a></address>
              </td>
            </tr>
          </tbody>
        </table>
        `,
      ),
    );

    const ctx = createMockContext({ keyword: '안산 중앙역' });
    await handleCuFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          location: null,
          stores: expect.any(Array),
        }),
      }),
    );
  });

  it('좌표가 주어지면 location을 포함해 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          storeList: [{ storeCd: '1', storeNm: '강남점', latVal: 37.5, longVal: 127.0 }],
        }),
      ),
    );

    const ctx = createMockContext({ keyword: '강남', lat: '37.5', lng: '127.0' });
    await handleCuFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          location: { latitude: 37.5, longitude: 127 },
        }),
      }),
    );
  });

  it('유효하지 않은 좌표면 location을 null로 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response('<table><tbody></tbody></table>'));

    const ctx = createMockContext({ keyword: '강남', lat: 'abc', lng: 'def' });
    await handleCuFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ location: null }),
      }),
    );
  });

  it('CU 매장 검색 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('cu store fail'));

    const ctx = createMockContext({ keyword: '강남', lat: '37.5', lng: '127.0' });
    await handleCuFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CU_STORE_SEARCH_FAILED', message: 'cu store fail' },
      }),
      500,
    );
  });

  it('keyword 없이도 기본 검색을 수행한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    const ctx = createMockContext({});
    await handleCuFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('CU 매장 검색의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(123);

    const ctx = createMockContext({ keyword: '강남', lat: '37.5', lng: '127.0' });
    await handleCuFindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CU_STORE_SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });
});

describe('handleCuCheckInventory', () => {
  it('CU 재고 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaList: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'Y',
            data: {
              stockResult: {
                result: {
                  total_count: 1,
                  rows: [
                    {
                      fields: {
                        item_cd: '8801',
                        item_nm: '감자칩',
                        hyun_maega: '1700',
                        pickup_yn: 'Y',
                        deliv_yn: 'Y',
                        reserv_yn: 'N',
                      },
                    },
                  ],
                },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            totalCnt: 1,
            storeList: [{ storeCd: '1', storeNm: '강남점', latVal: 37.5, longVal: 127.0, stock: '5' }],
          }),
        ),
      );

    const ctx = createMockContext({ keyword: '과자', lat: '37.5', lng: '127.0' });
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyword: '과자',
          location: { latitude: 37.5, longitude: 127 },
          inventory: expect.objectContaining({ totalCount: 1 }),
          nearbyStores: expect.objectContaining({ stockItemCode: '8801' }),
        }),
      }),
    );
  });

  it('storeCheck=false이면 매장 조회 없이 재고 상품만 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaList: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: {
              stockResult: {
                result: {
                  total_count: 1,
                  rows: [
                    {
                      fields: {
                        item_cd: '8801',
                        item_nm: '감자칩',
                      },
                    },
                  ],
                },
              },
            },
          }),
        ),
      );

    const ctx = createMockContext({ keyword: '과자', storeCheck: 'false' });
    await handleCuCheckInventory(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          nearbyStores: {
            totalCount: 0,
            stockItemCode: '8801',
            stockItemName: '감자칩',
            stores: [],
          },
          inventory: expect.objectContaining({ totalCount: 1 }),
        }),
      }),
    );
  });

  it('storeCheck=1이면 매장 조회를 수행한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 1, storeList: [] })));

    const ctx = createMockContext({ keyword: '과자', storeCheck: '1' });
    await handleCuCheckInventory(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          nearbyStores: expect.objectContaining({ totalCount: 1 }),
        }),
      }),
    );
  });

  it('storeCheck 값이 유효하지 않으면 기본값으로 매장 조회를 수행한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 1, storeList: [] })));

    const ctx = createMockContext({ keyword: '과자', storeCheck: 'maybe' });
    await handleCuCheckInventory(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          nearbyStores: expect.objectContaining({ totalCount: 1 }),
        }),
      }),
    );
  });

  it('storeKeyword만 있으면 위치를 null로 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('<table><tbody><tr><td><span class="name">안산중앙점</span></td></tr></tbody></table>'));

    const ctx = createMockContext({ keyword: '치킨', storeKeyword: '안산 중앙역' });
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          location: null,
        }),
      }),
    );
  });

  it('주소가 있어도 Google 키가 없으면 키워드 매장 결과를 그대로 사용한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `
          <table>
            <tbody>
              <tr>
                <td><span class="name">안산중앙역에코점</span></td>
                <td><div class="detail_info"><address><a href="#">경기도 안산시 단원구 중앙대로 885</a></address></div></td>
              </tr>
            </tbody>
          </table>
          `,
        ),
      );

    const ctx = createMockContext({ keyword: '치킨', storeKeyword: '안산 중앙역' });
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          nearbyStores: expect.objectContaining({ totalCount: 1 }),
        }),
      }),
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('재고 시드가 없으면 기본 페이지 타입으로 매장 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    const ctx = createMockContext({ keyword: '치킨', lat: '37.3177', lng: '126.8412' });
    await handleCuCheckInventory(ctx);

    const requestInit = mockFetch.mock.calls[2][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.isRecommend).toBe('');
    expect(body.recommendId).toBe('');
    expect(body.pageType).toBe('search_improve');
  });

  it('storeKeyword 지오코딩 성공 시 좌표 기반으로 재조회한다', async () => {
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
                  rows: [{ fields: { item_cd: '2202000140047', on_item_no: '2026020061628' } }],
                },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `
          <table>
            <tbody>
              <tr>
                <td><span class="name">안산중앙역에코점</span></td>
                <td>
                  <div class="detail_info">
                    <address><a href="#">경기도 안산시 단원구 중앙대로 885</a></address>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          `,
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.3172, lng: 126.8354 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    const ctx = createMockContextWithEnv(
      { keyword: '치킨', storeKeyword: '안산 중앙역' },
      { GOOGLE_MAPS_API_KEY: 'test-google-key' },
    );
    await handleCuCheckInventory(ctx);

    const geocodeUrl = String(mockFetch.mock.calls[3][0]);
    expect(geocodeUrl).toContain('maps.googleapis.com/maps/api/geocode/json');
    const requestInit = mockFetch.mock.calls[4][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.latVal).toBe('37.3172');
    expect(body.longVal).toBe('126.8354');
  });

  it('지오코딩 성공 + 재고 시드 없음이면 기본 페이지 타입으로 재조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            spellModifyYn: 'N',
            data: { stockResult: { result: { total_count: 0, rows: [] } } },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `
          <table><tbody>
            <tr>
              <td><span class="name">안산중앙역에코점</span></td>
              <td><div class="detail_info"><address><a href="#">경기도 안산시 단원구 중앙대로 885</a></address></div></td>
            </tr>
          </tbody></table>
          `,
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.3172, lng: 126.8354 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    const ctx = createMockContextWithEnv(
      { keyword: '치킨', storeKeyword: '안산 중앙역' },
      { GOOGLE_MAPS_API_KEY: 'test-google-key' },
    );
    await handleCuCheckInventory(ctx);

    const requestInit = mockFetch.mock.calls[4][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.isRecommend).toBe('');
    expect(body.recommendId).toBe('');
    expect(body.pageType).toBe('search_improve');
  });

  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('CU 재고 검색 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('cu inventory fail'));

    const ctx = createMockContext({ keyword: '과자' });
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CU_INVENTORY_CHECK_FAILED', message: 'cu inventory fail' },
      }),
      500,
    );
  });

  it('CU 재고 검색의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({ keyword: '과자' });
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CU_INVENTORY_CHECK_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });
});
