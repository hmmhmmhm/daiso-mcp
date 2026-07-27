/**
 * CU 주변 매장 탐색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFindNearbyStoresTool } from '../../../../src/services/cu/tools/findNearbyStores.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFindNearbyStoresTool', () => {
  it('주입된 Worker Zyte 키로 차단된 매장 검색을 복구한다', async () => {
    const html = `
      <table>
        <tbody>
          <tr><td><span class="name">강남점</span></td></tr>
        </tbody>
      </table>
    `;
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
            httpResponseBody: Buffer.from(html, 'utf8').toString('base64'),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const tool = createFindNearbyStoresTool('worker-key');
    const result = await tool.handler({ keyword: '강남', limit: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stores[0].storeName).toBe('강남점');
    const zyteHeaders = new Headers(mockFetch.mock.calls[1][1]?.headers);
    expect(zyteHeaders.get('Authorization')).toBe(
      `Basic ${Buffer.from('worker-key:', 'utf8').toString('base64')}`,
    );
  });

  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindNearbyStoresTool();

    expect(tool.name).toBe('cu_find_nearby_stores');
    expect(tool.metadata.title).toBe('CU 주변 매장 탐색');
  });

  it('키워드만으로 CU 매장 목록을 반환한다', async () => {
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

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '안산 중앙역', limit: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.location).toBeNull();
    expect(parsed.stores[0].storeCode).toBe('48806');
  });

  it('좌표가 있으면 location 정보를 포함한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          storeList: [
            {
              storeCd: '1',
              storeNm: '안산중앙점',
              latVal: 37.318,
              longVal: 126.838,
            },
          ],
        }),
      ),
    );

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '안산', latitude: 37.3185, longitude: 126.838, limit: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.location).toEqual({ latitude: 37.3185, longitude: 126.838 });
  });
});
