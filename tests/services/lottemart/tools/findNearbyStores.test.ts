/**
 * 롯데마트 주변 매장 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteMartCaches } from '../../../../src/services/lottemart/client.js';
import { createFindNearbyStoresTool } from '../../../../src/services/lottemart/tools/findNearbyStores.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearLotteMartCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFindNearbyStoresTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindNearbyStoresTool();

    expect(tool.name).toBe('lottemart_find_nearby_stores');
    expect(tool.metadata.title).toBe('롯데마트 주변 매장 탐색');
  });

  it('거리순 매장을 반환한다', async () => {
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

    const tool = createFindNearbyStoresTool('test-key');
    const result = await tool.handler({
      area: '서울',
      latitude: 37.5354,
      longitude: 127.0958,
      limit: 1,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.location).toEqual({ latitude: 37.5354, longitude: 127.0958 });
    expect(parsed.stores[0].distanceM).toBe(0);
  });
});
