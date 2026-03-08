/**
 * 앱 통합 테스트 - CU API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/cu/stores', () => {
  it('키워드만으로 CU 매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        `
        <table>
          <tbody>
            <tr>
              <td>
                <span class="name">안산중앙역에코점</span>
                <span class="tel"></span>
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

    const res = await app.request('/api/cu/stores?keyword=안산%20중앙역', undefined, {
      ZYTE_API_KEY: 'test-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.stores).toHaveLength(1);
    expect(data.data.stores[0].storeName).toBe('안산중앙역에코점');
  });
});

describe('GET /api/cu/inventory', () => {
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
                        deliv_yn: 'N',
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

    const res = await app.request('/api/cu/inventory?keyword=과자', undefined, {
      ZYTE_API_KEY: 'test-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.inventory.items).toHaveLength(1);
  });

  it('keyword 없이 요청하면 에러를 반환한다', async () => {
    const res = await app.request('/api/cu/inventory');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_QUERY');
  });
});
