/**
 * 메가박스 주변 지점 탐색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFindNearbyTheatersTool } from '../../../../src/services/megabox/tools/findNearbyTheaters.js';
import { __testOnlyClearMegaboxLocationCaches } from '../../../../src/services/megabox/location.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearMegaboxLocationCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFindNearbyTheatersTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindNearbyTheatersTool();

    expect(tool.name).toBe('megabox_find_nearby_theaters');
    expect(tool.metadata.title).toBe('메가박스 주변 지점 탐색');
  });

  it('주변 지점을 거리순으로 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [
              { brchNo: '1372', brchNm: '강남' },
              { brchNo: '1350', brchNm: '코엑스' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울 강남구 강남대로 438</dd><a href="?lng=127.0264&lat=37.4982">지도</a>'),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울 강남구 봉은사로 524</dd><a href="?lng=127.0592&lat=37.5121">지도</a>'),
      );

    const tool = createFindNearbyTheatersTool();
    const result = await tool.handler({ latitude: 37.4982, longitude: 127.0264, limit: 2 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.theaters[0].theaterId).toBe('1372');
    expect(parsed.theaters[0].distanceKm).toBe(0);
  });

  it('지점 정보 실패/좌표 누락 항목을 제외한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [
              { brchNo: '1', brchNm: 'A' },
              { brchNo: '2', brchNm: 'B' },
            ],
          })
        )
      )
      .mockResolvedValueOnce(new Response('<dt>주소</dt><dd>좌표없음</dd>'))
      .mockRejectedValueOnce(new Error('failed'));

    const tool = createFindNearbyTheatersTool();
    const result = await tool.handler({ latitude: 37.5, longitude: 127.0 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.theaters).toHaveLength(0);
  });

  it('위치 키워드를 지오코드해 안산 기준 지점을 반환한다', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구',
                geometry: {
                  location: { lat: 37.3171, lng: 126.8389 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      );

    const tool = createFindNearbyTheatersTool();
    const result = await tool.handler({ keyword: '안산 중앙역', limit: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.areaCode).toBe('41');
    expect(parsed.theaters[0].theaterId).toBe('4431');
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});
