/**
 * 메가박스 영화 목록 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createListNowShowingTool } from '../../../../src/services/megabox/tools/listNowShowing.js';
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

describe('createListNowShowingTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createListNowShowingTool();

    expect(tool.name).toBe('megabox_list_now_showing');
    expect(tool.metadata.title).toBe('메가박스 영화 목록 조회');
  });

  it('영화/회차 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '1372', brchNm: '강남' }],
          movieList: [{ movieNo: '25104500', movieNm: '테스트 영화', movieStatCdNm: '상영중' }],
          movieFormList: [
            {
              playSchdlNo: '2603041372011',
              movieNo: '25104500',
              movieNm: '테스트 영화',
              brchNo: '1372',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 42,
              totSeatCnt: 100,
            },
          ],
        }),
      ),
    );

    const tool = createListNowShowingTool();
    const result = await tool.handler({ playDate: '20260304', theaterId: '1372' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.counts.movies).toBe(1);
    expect(parsed.counts.showtimes).toBe(1);
    expect(parsed.showtimes[0].startTime).toBe('09:30');
  });

  it('필터가 없으면 null로 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ areaBrchList: [], movieList: [], movieFormList: [] })));

    const tool = createListNowShowingTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterId).toBeNull();
    expect(parsed.filters.movieId).toBeNull();
  });

  it('전달된 latitude/longitude를 필터 응답에 그대로 담는다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '1372', brchNm: '강남' }],
          movieList: [],
          movieFormList: [],
        }),
      ),
    );

    const tool = createListNowShowingTool();
    const result = await tool.handler({
      playDate: '20260315',
      theaterId: '1372',
      latitude: 37.3171,
      longitude: 126.8389,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.latitude).toBe(37.3171);
    expect(parsed.filters.longitude).toBe(126.8389);
  });

  it('theaterId가 없어도 위치 키워드로 가장 가까운 지점을 자동 선택한다', async () => {
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
            movieList: [{ movieNo: '25104500', movieNm: '테스트 영화' }],
            movieFormList: [
              {
                playSchdlNo: '2603154431001',
                movieNo: '25104500',
                movieNm: '테스트 영화',
                brchNo: '4431',
                brchNm: '안산중앙',
                playDe: '20260315',
                playStartTime: '1010',
                playEndTime: '1210',
                restSeatCnt: 30,
                totSeatCnt: 100,
              },
            ],
          }),
        ),
      );

    const tool = createListNowShowingTool();
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterId).toBe('4431');
    expect(parsed.filters.areaCode).toBe('41');
    expect(parsed.resolvedTheater.theaterName).toBe('안산중앙');
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});
