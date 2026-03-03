/**
 * 메가박스 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleMegaboxFindNearbyTheaters,
  handleMegaboxListNowShowing,
  handleMegaboxGetRemainingSeats,
} from '../../src/api/megaboxHandlers.js';

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
  } as unknown as Parameters<typeof handleMegaboxFindNearbyTheaters>[0];
}

describe('handleMegaboxFindNearbyTheaters', () => {
  it('메가박스 주변 지점을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ areaBrchList: [{ brchNo: '1372', brchNm: '강남' }] }))
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울 강남구 강남대로</dd><a href="?lng=127.0&lat=37.5">지도</a>')
      );

    const ctx = createMockContext({ lat: '37.5', lng: '127.0' });
    await handleMegaboxFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ theaters: expect.any(Array) }),
      })
    );
  });

  it('메가박스 지점 조회 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('megabox fail'));

    const ctx = createMockContext({});
    await handleMegaboxFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MEGABOX_THEATER_SEARCH_FAILED', message: 'megabox fail' },
      }),
      500
    );
  });

  it('메가박스 지점 조회의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(undefined);

    const ctx = createMockContext({});
    await handleMegaboxFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MEGABOX_THEATER_SEARCH_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });

  it('지점 상세 실패/좌표 누락 항목을 제외하고 거리순 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [
              { brchNo: '1', brchNm: 'A' },
              { brchNo: '2', brchNm: 'B' },
              { brchNo: '3', brchNm: 'C' },
            ],
          })
        )
      )
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(new Response('<dt>주소</dt><dd>좌표없음</dd>'))
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울</dd><a href="?lng=127.1&lat=37.6">지도</a>')
      );

    const ctx = createMockContext({ lat: '37.5', lng: '127.0' });
    await handleMegaboxFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          theaters: [expect.objectContaining({ theaterId: '3' })],
        }),
      })
    );
  });

  it('여러 지점을 거리순으로 정렬한다', async () => {
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
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울</dd><a href="?lng=127.5&lat=37.5">지도</a>')
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울</dd><a href="?lng=127.0&lat=37.5">지도</a>')
      );

    const ctx = createMockContext({ lat: '37.5', lng: '127.0' });
    await handleMegaboxFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          theaters: [
            expect.objectContaining({ theaterId: '2' }),
            expect.objectContaining({ theaterId: '1' }),
          ],
        }),
      })
    );
  });
});

describe('handleMegaboxListNowShowing', () => {
  it('메가박스 영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '1372', brchNm: '강남' }],
          movieList: [{ movieNo: '25104500', movieNm: '영화A' }],
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: '25104500',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 10,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const ctx = createMockContext({ playDate: '20260304', theaterId: '1372' });
    await handleMegaboxListNowShowing(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          movies: expect.any(Array),
          showtimes: expect.any(Array),
        }),
      })
    );
  });

  it('메가박스 영화 목록 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('movie list fail'));

    const ctx = createMockContext({});
    await handleMegaboxListNowShowing(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MEGABOX_MOVIE_LIST_FAILED', message: 'movie list fail' },
      }),
      500
    );
  });

  it('메가박스 영화 목록의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(123);

    const ctx = createMockContext({});
    await handleMegaboxListNowShowing(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MEGABOX_MOVIE_LIST_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});

describe('handleMegaboxGetRemainingSeats', () => {
  it('메가박스 잔여 좌석을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 12,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const ctx = createMockContext({ playDate: '20260304', theaterId: '1372' });
    await handleMegaboxGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ seats: expect.any(Array) }),
      })
    );
  });

  it('동일 시작시간은 지점명으로 정렬한다', async () => {
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
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 12,
              totSeatCnt: 100,
            },
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1000',
              brchNm: '강남',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 20,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const ctx = createMockContext({ playDate: '20260304', movieId: 'M1' });
    await handleMegaboxGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          seats: [
            expect.objectContaining({ theaterName: '강남' }),
            expect.objectContaining({ theaterName: '코엑스' }),
          ],
        }),
      })
    );
  });

  it('시작시간이 다르면 시간순으로 정렬한다', async () => {
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
              playStartTime: '1200',
              playEndTime: '1400',
              restSeatCnt: 12,
              totSeatCnt: 100,
            },
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1000',
              brchNm: '강남',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 20,
              totSeatCnt: 100,
            },
          ],
        })
      )
    );

    const ctx = createMockContext({ playDate: '20260304', movieId: 'M1' });
    await handleMegaboxGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          seats: [
            expect.objectContaining({ scheduleId: 'S1' }),
            expect.objectContaining({ scheduleId: 'S2' }),
          ],
        }),
      })
    );
  });

  it('메가박스 좌석 조회 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('seat fail'));

    const ctx = createMockContext({});
    await handleMegaboxGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MEGABOX_SEAT_LIST_FAILED', message: 'seat fail' },
      }),
      500
    );
  });

  it('메가박스 좌석 조회의 알 수 없는 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(null);

    const ctx = createMockContext({});
    await handleMegaboxGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MEGABOX_SEAT_LIST_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500
    );
  });
});
