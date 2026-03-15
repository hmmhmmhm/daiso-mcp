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

function createMockContext(query: Record<string, string> = {}, env: Record<string, string> = {}) {
  return {
    env,
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
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
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

  it('regionCode 파라미터가 없으면 null 필터를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304' });
    await handleCgvFindTheaters(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { regionCode: string | null } };
    };
    expect(payload.data.filters.regionCode).toBeNull();
  });

  it('keyword가 있으면 가까운 극장을 우선 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
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
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구 고잔동 535',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260315', keyword: '안산 중앙역' }, { GOOGLE_MAPS_API_KEY: 'test-google-key' });
    await handleCgvFindTheaters(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { theaters: Array<{ theaterCode: string }>; keyword: string };
    };
    expect(payload.data.keyword).toBe('안산 중앙역');
    expect(payload.data.theaters[0].theaterCode).toBe('0211');
  });

  it('잘못된 lat/lng 값은 무시한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304', lat: 'abc', lng: 'def' });
    await handleCgvFindTheaters(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { latitude: number | null; longitude: number | null } };
    };
    expect(payload.data.filters.latitude).toBeNull();
    expect(payload.data.filters.longitude).toBeNull();
  });

  it('유효한 lat/lng 값은 숫자로 파싱한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구 고잔동 535',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      );

    const ctx = createMockContext(
      { playDate: '20260315', lat: '37.3171', lng: '126.8389' },
      { GOOGLE_MAPS_API_KEY: 'test-google-key' },
    );
    await handleCgvFindTheaters(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { latitude: number | null; longitude: number | null };
    };
    expect(payload.data.latitude).toBe(37.3171);
    expect(payload.data.longitude).toBe(126.8389);
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

  it('CGV 극장 조회 중 비 Error 예외는 기본 메시지로 처리한다', async () => {
    mockFetch.mockRejectedValue({ code: 'X' });

    const ctx = createMockContext({});
    await handleCgvFindTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'CGV_THEATER_SEARCH_FAILED',
          message: '알 수 없는 오류가 발생했습니다.',
        },
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
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [{ movNo: '30000985', movNm: '영화A', cratgClsNm: '12세' }],
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

  it('theaterCode 파라미터가 없으면 null 필터를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '01',
                regnGrpNm: '서울',
                siteList: [{ siteNo: '0056', siteNm: '강남' }],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [{ movNo: '30000985', movNm: '영화A' }],
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260304' });
    await handleCgvSearchMovies(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { theaterCode: string | null } };
    };
    expect(payload.data.filters.theaterCode).toBeNull();
  });

  it('keyword만 있어도 가까운 극장을 골라 영화를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
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
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구 고잔동 535',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [{ movNo: '30000985', movNm: '영화A', cratgClsNm: '12세' }],
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260315', keyword: '안산 중앙역' }, { GOOGLE_MAPS_API_KEY: 'test-google-key' });
    await handleCgvSearchMovies(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { theaterCode: string | null }; resolvedTheater: { theaterCode: string } };
    };
    expect(payload.data.filters.theaterCode).toBe('0211');
    expect(payload.data.resolvedTheater.theaterCode).toBe('0211');
  });

  it('keyword 기준 극장을 못 찾으면 빈 영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260315', keyword: '안산 중앙역' });
    await handleCgvSearchMovies(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { theaterCode: string | null }; resolvedTheater: null; movies: [] };
    };
    expect(payload.data.filters.theaterCode).toBeNull();
    expect(payload.data.resolvedTheater).toBeNull();
    expect(payload.data.movies).toEqual([]);
  });

  it('CGV 영화 조회 중 비 Error 예외는 기본 메시지로 처리한다', async () => {
    mockFetch.mockRejectedValue({ code: 'X' });

    const ctx = createMockContext({});
    await handleCgvSearchMovies(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'CGV_MOVIE_SEARCH_FAILED',
          message: '알 수 없는 오류가 발생했습니다.',
        },
      }),
      500,
    );
  });

  it('CGV 영화 조회 중 Error 예외는 메시지를 그대로 사용한다', async () => {
    mockFetch.mockRejectedValue(new Error('movies fail'));

    const ctx = createMockContext({});
    await handleCgvSearchMovies(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'CGV_MOVIE_SEARCH_FAILED',
          message: 'movies fail',
        },
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
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              siteNo: '0056',
              siteNm: 'CGV강남',
              scnYmd: '20260304',
              scnSseq: '1',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '0930',
              scnendTm: '1130',
              stcnt: 100,
              frSeatCnt: 30,
            },
          ],
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

  it('동일 시작 시간은 극장명으로 정렬한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              siteNo: '0056',
              siteNm: 'CGV홍대',
              scnYmd: '20260304',
              scnSseq: '2',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '0930',
              scnendTm: '1130',
              stcnt: 100,
              frSeatCnt: 30,
            },
            {
              siteNo: '0056',
              siteNm: 'CGV강남',
              scnYmd: '20260304',
              scnSseq: '1',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '0930',
              scnendTm: '1130',
              stcnt: 100,
              frSeatCnt: 40,
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304', theaterCode: '0056', movieCode: 'M1' });
    await handleCgvGetTimetable(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { timetable: Array<{ theaterName: string }> };
    };
    expect(payload.data.timetable[0].theaterName).toBe('CGV강남');
  });

  it('시작 시간이 다르면 시간 오름차순으로 정렬한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              siteNo: '0056',
              siteNm: 'CGV강남',
              scnYmd: '20260304',
              scnSseq: '2',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '1200',
              scnendTm: '1400',
              stcnt: 100,
              frSeatCnt: 30,
            },
            {
              siteNo: '0056',
              siteNm: 'CGV강남',
              scnYmd: '20260304',
              scnSseq: '1',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '0930',
              scnendTm: '1130',
              stcnt: 100,
              frSeatCnt: 40,
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260304', theaterCode: '0056', movieCode: 'M1' });
    await handleCgvGetTimetable(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { timetable: Array<{ startTime: string }> };
    };
    expect(payload.data.timetable[0].startTime).toBe('09:30');
  });

  it('theaterCode/movieCode가 없으면 null 필터를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '01',
                regnGrpNm: '서울',
                siteList: [{ siteNo: '0056', siteNm: '강남' }],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0056',
                siteNm: 'CGV강남',
                scnYmd: '20260304',
                scnSseq: '1',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '0930',
                scnendTm: '1130',
                stcnt: 100,
                frSeatCnt: 40,
              },
            ],
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260304' });
    await handleCgvGetTimetable(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { theaterCode: string | null; movieCode: string | null } };
    };
    expect(payload.data.filters.theaterCode).toBeNull();
    expect(payload.data.filters.movieCode).toBeNull();
  });

  it('keyword만 있어도 가까운 극장을 골라 시간표를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
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
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구 고잔동 535',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0211',
                siteNm: 'CGV안산',
                scnYmd: '20260315',
                scnSseq: '1',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '0930',
                scnendTm: '1130',
                stcnt: 100,
                frSeatCnt: 30,
              },
            ],
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260315', keyword: '안산 중앙역' }, { GOOGLE_MAPS_API_KEY: 'test-google-key' });
    await handleCgvGetTimetable(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { theaterCode: string | null }; resolvedTheater: { theaterCode: string } };
    };
    expect(payload.data.filters.theaterCode).toBe('0211');
    expect(payload.data.resolvedTheater.theaterCode).toBe('0211');
  });

  it('keyword 기준 극장을 못 찾으면 빈 시간표를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ playDate: '20260315', keyword: '안산 중앙역' });
    await handleCgvGetTimetable(ctx);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { filters: { theaterCode: string | null }; resolvedTheater: null; timetable: [] };
    };
    expect(payload.data.filters.theaterCode).toBeNull();
    expect(payload.data.resolvedTheater).toBeNull();
    expect(payload.data.timetable).toEqual([]);
  });

  it('CGV 시간표 조회 중 비 Error 예외는 기본 메시지로 처리한다', async () => {
    mockFetch.mockRejectedValue(404);

    const ctx = createMockContext({});
    await handleCgvGetTimetable(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'CGV_TIMETABLE_FETCH_FAILED',
          message: '알 수 없는 오류가 발생했습니다.',
        },
      }),
      500,
    );
  });

  it('CGV 시간표 조회 중 Error 예외는 메시지를 그대로 사용한다', async () => {
    mockFetch.mockRejectedValue(new Error('timetable fail'));

    const ctx = createMockContext({});
    await handleCgvGetTimetable(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'CGV_TIMETABLE_FETCH_FAILED',
          message: 'timetable fail',
        },
      }),
      500,
    );
  });
});
