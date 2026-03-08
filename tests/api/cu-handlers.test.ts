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
            totalCnt: 1,
            storeList: [{ storeCd: '1', storeNm: '강남점', latVal: 37.5, longVal: 127.0 }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
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
      );

    const ctx = createMockContext({ keyword: '과자' });
    await handleCuCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyword: '과자',
          inventory: expect.objectContaining({ totalCount: 1 }),
        }),
      }),
    );
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
