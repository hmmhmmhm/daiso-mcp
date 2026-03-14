/**
 * 롯데마트 주변 매장 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteMartCaches } from '../../../../src/services/lottemart/client.js';
import { createFindNearbyStoresTool } from '../../../../src/services/lottemart/tools/findNearbyStores.js';

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

describe('createFindNearbyStoresTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindNearbyStoresTool();

    expect(tool.name).toBe('lottemart_find_nearby_stores');
    expect(tool.metadata.title).toBe('롯데마트 주변 매장 탐색');
  });

  it('거리순 매장을 반환한다', async () => {
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

  it('지역이 없으면 전체 지역 기준 응답을 구성하고 전달된 API 키를 우선 사용한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://company.lottemart.com/mobiledowa/') {
        return Promise.resolve(createSessionResponse());
      }

      if (url.includes('maps.googleapis.com')) {
        expect(url).toContain('key=override-key');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'OK',
              results: [{ geometry: { location: { lat: 37.5665, lng: 126.978 } } }],
            }),
          ),
        );
      }

      return Promise.resolve(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">서울역점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 서울 중구 한강대로 405</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2301"></a>
              </li>
            </ul>
          </section>
        `),
      );
    });

    const tool = createFindNearbyStoresTool('fallback-key');
    const result = await tool.handler({
      keyword: '서울역',
      limit: 1,
      googleMapsApiKey: 'override-key',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.area).toBeNull();
    expect(parsed.brandVariant).toBeNull();
    expect(parsed.count).toBe(1);
  });
});
