/**
 * CU 재고 확인 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckInventoryTool } from '../../../../src/services/cu/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCheckInventoryTool', () => {
  it('주입된 Worker 키로 폴백하고 차단된 재고를 unavailable로 반환한다', async () => {
    const zyteBanBody = JSON.stringify({
      type: '/download/website-ban',
      title: 'Website Ban',
      status: 520,
      detail: 'Zyte API could not get a ban-free response.',
    });
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ areaList: [] })))
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(zyteBanBody, {
          status: 520,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(zyteBanBody, {
          status: 520,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 0, storeList: [] })));

    const tool = createCheckInventoryTool({
      zyteApiKey: 'worker-key',
      googleMapsApiKey: 'maps-key',
    });
    const result = await tool.handler({
      keyword: '과자',
      latitude: 37.5,
      longitude: 127,
      storeLimit: 1,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.inventory).toEqual(
      expect.objectContaining({
        available: false,
        unavailableReason: expect.stringContaining('Website Ban'),
        totalCount: 0,
        items: [],
      }),
    );
    const zyteHeaders = new Headers(mockFetch.mock.calls[2][1]?.headers);
    expect(zyteHeaders.get('Authorization')).toBe(
      `Basic ${Buffer.from('worker-key:', 'utf8').toString('base64')}`,
    );
  });

  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('cu_check_inventory');
    expect(tool.metadata.title).toBe('CU 재고 확인');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('주변 매장과 재고 검색 결과를 함께 반환한다', async () => {
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
            storeList: [
              {
                storeCd: '1',
                storeNm: '강남점',
                latVal: 37.5,
                longVal: 127.0,
                distance: 100,
                stock: '7',
              },
            ],
          }),
        ),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({
      keyword: '과자',
      latitude: 37.5,
      longitude: 127.0,
      storeLimit: 5,
      size: 8,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nearbyStores.totalCount).toBe(1);
    expect(parsed.inventory.totalCount).toBe(1);
    expect(parsed.inventory.items[0].itemCode).toBe('8801');
    expect(parsed.nearbyStores.stockItemCode).toBe('8801');
    expect(parsed.nearbyStores.stores[0].stock).toBe(7);
  });

  it('좌표 없이 storeKeyword만 있으면 기본 좌표를 강제하지 않는다', async () => {
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
              </tr>
            </tbody>
          </table>
          `,
        ),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '치킨', storeKeyword: '안산 중앙역' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.location).toBeNull();
    expect(parsed.nearbyStores.stores[0].storeName).toBe('안산중앙역에코점');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://cu.bgfretail.com/store/list_Ajax.do',
      expect.any(Object),
    );
  });

  it('주소가 있어도 Google 키가 없으면 키워드 매장 결과를 그대로 사용한다', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;

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

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '치킨', storeKeyword: '안산 중앙역' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.nearbyStores.totalCount).toBe(1);
    expect(parsed.nearbyStores.stores[0].storeName).toBe('안산중앙역에코점');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('재고 시드가 없으면 매장 조회 추천 파라미터를 비워서 호출한다', async () => {
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

    const tool = createCheckInventoryTool();
    await tool.handler({ keyword: '치킨', latitude: 37.3177, longitude: 126.8412 });

    const requestInit = mockFetch.mock.calls[2][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.isRecommend).toBe('');
    expect(body.recommendId).toBe('');
    expect(body.pageType).toBe('search_improve');
  });

  it('storeKeyword 기반 지오코딩이 성공하면 좌표 기반 재조회한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

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
                  rows: [
                    {
                      fields: {
                        item_cd: '2202000140047',
                        on_item_no: '2026020061628',
                        item_nm: '해동)핫스파이시닭강정',
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
          `
          <table>
            <tbody>
              <tr>
                <td>
                  <span class="name">안산중앙역에코점</span>
                </td>
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

    const tool = createCheckInventoryTool();
    await tool.handler({ keyword: '치킨', storeKeyword: '안산 중앙역' });

    const geocodeUrl = String(mockFetch.mock.calls[3][0]);
    expect(geocodeUrl).toContain('maps.googleapis.com/maps/api/geocode/json');
    const requestInit = mockFetch.mock.calls[4][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.latVal).toBe('37.3172');
    expect(body.longVal).toBe('126.8354');
    expect(body.itemCd).toBe('2202000140047');

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });

  it('지오코딩 성공 + 재고 시드 없음이면 기본 페이지 타입으로 재조회한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

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

    const tool = createCheckInventoryTool();
    await tool.handler({ keyword: '치킨', storeKeyword: '안산 중앙역' });

    const requestInit = mockFetch.mock.calls[4][1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.isRecommend).toBe('');
    expect(body.recommendId).toBe('');
    expect(body.pageType).toBe('search_improve');

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });
});
