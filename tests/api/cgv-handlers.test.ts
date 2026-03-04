/**
 * CGV API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleCgvFindTheaters,
  handleCgvSearchMovies,
  handleCgvGetTimetable,
} from '../../src/api/cgvHandlers.js';

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
  } as unknown as Parameters<typeof handleCgvFindTheaters>[0];
}

describe('handleCgvFindTheaters', () => {
  it('CGV 극장 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TheaterList: [{ TheaterCd: '0056', TheaterName: 'CGV강남', AreaCd: '01' }],
          },
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304', regionCode: '01' });
    await handleCgvFindTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ theaters: expect.any(Array) }),
      }),
    );
  });

  it('CGV 극장 조회 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('cgv theaters fail'));

    const ctx = createMockContext({});
    await handleCgvFindTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CGV_THEATER_SEARCH_FAILED', message: 'cgv theaters fail' },
      }),
      500,
    );
  });
});

describe('handleCgvSearchMovies', () => {
  it('CGV 영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            MovieList: [{ MovieCd: '200001', MovieName: '영화A', Grade: '12' }],
          },
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304', theaterCode: '0056' });
    await handleCgvSearchMovies(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ movies: expect.any(Array) }),
      }),
    );
  });

  it('CGV 영화 조회 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('cgv movies fail'));

    const ctx = createMockContext({});
    await handleCgvSearchMovies(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CGV_MOVIE_SEARCH_FAILED', message: 'cgv movies fail' },
      }),
      500,
    );
  });
});

describe('handleCgvGetTimetable', () => {
  it('CGV 시간표를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH1',
                MovieCd: 'M1',
                MovieName: '영화A',
                TheaterCd: '0056',
                TheaterName: 'CGV강남',
                PlayYmd: '20260304',
                StartTime: '0930',
                EndTime: '1130',
                TotalSeat: 100,
                RemainSeat: 30,
              },
            ],
          },
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304', theaterCode: '0056', movieCode: 'M1' });
    await handleCgvGetTimetable(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ timetable: expect.any(Array) }),
      }),
    );
  });

  it('CGV 시간표 조회 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('cgv timetable fail'));

    const ctx = createMockContext({});
    await handleCgvGetTimetable(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'CGV_TIMETABLE_FETCH_FAILED', message: 'cgv timetable fail' },
      }),
      500,
    );
  });
});
