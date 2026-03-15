/**
 * 메가박스 잔여 좌석 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGetRemainingSeatsTool } from '../../../../src/services/megabox/tools/getRemainingSeats.js';
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

describe('createGetRemainingSeatsTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createGetRemainingSeatsTool();

    expect(tool.name).toBe('megabox_get_remaining_seats');
    expect(tool.metadata.title).toBe('메가박스 잔여 좌석 조회');
  });

  it('회차별 잔여 좌석 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S2',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '1200',
              playEndTime: '1400',
              restSeatCnt: 20,
              totSeatCnt: 100,
            },
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '0930',
              playEndTime: '1130',
              restSeatCnt: 35,
              totSeatCnt: 100,
            },
          ],
        }),
      ),
    );

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260304', theaterId: '1372', movieId: 'M1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.seats[0].scheduleId).toBe('S1');
    expect(parsed.seats[0].remainingSeats).toBe(35);
  });

  it('동일 시작 시간은 지점명으로 정렬한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S2',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '2000',
              brchNm: '코엑스',
              playDe: '20260304',
              playStartTime: '0930',
              playEndTime: '1130',
              restSeatCnt: 20,
              totSeatCnt: 100,
            },
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1000',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '0930',
              playEndTime: '1130',
              restSeatCnt: 35,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260304', movieId: 'M1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.seats[0].theaterName).toBe('강남');
    expect(parsed.seats[1].theaterName).toBe('코엑스');
  });

  it('필터가 없으면 theaterId/movieId를 null로 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S0',
              movieNo: 'M0',
              movieNm: '영화0',
              brchNo: '0001',
              brchNm: '테스트',
              playDe: '20260304',
              playStartTime: '0800',
              playEndTime: '1000',
              restSeatCnt: 30,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterId).toBeNull();
    expect(parsed.filters.movieId).toBeNull();
    expect(parsed.count).toBe(1);
  });

  it('전달된 latitude/longitude를 필터 응답에 그대로 담는다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [],
        }),
      ),
    );

    const tool = createGetRemainingSeatsTool();
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

  it('movieId 필터에서 불일치 회차를 제외한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1000',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '0930',
              playEndTime: '1130',
              restSeatCnt: 10,
              totSeatCnt: 100,
            },
            {
              playSchdlNo: 'S2',
              movieNo: 'M2',
              movieNm: '영화B',
              brchNo: '1000',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '1200',
              playEndTime: '1400',
              restSeatCnt: 15,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260304', movieId: 'M1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.seats[0].movieId).toBe('M1');
  });

  it('theaterId가 없어도 위치 키워드로 가장 가까운 지점 좌석을 조회한다', async () => {
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
            movieFormList: [
              {
                playSchdlNo: 'S1',
                movieNo: 'M1',
                movieNm: '영화A',
                brchNo: '4431',
                brchNm: '안산중앙',
                playDe: '20260315',
                playStartTime: '0930',
                playEndTime: '1130',
                restSeatCnt: 35,
                totSeatCnt: 100,
              },
            ],
          }),
        ),
      );

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterId).toBe('4431');
    expect(parsed.filters.areaCode).toBe('41');
    expect(parsed.resolvedTheater.theaterName).toBe('안산중앙');
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});
