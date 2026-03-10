/**
 * 롯데시네마 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleLotteCinemaFindNearbyTheaters,
  handleLotteCinemaGetRemainingSeats,
  handleLotteCinemaListNowShowing,
} from '../../src/api/lottecinemaHandlers.js';

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
  } as unknown as Parameters<typeof handleLotteCinemaFindNearbyTheaters>[0];
}

function createTicketingResponse() {
  return new Response(
    JSON.stringify({
      IsOK: true,
      Cinemas: {
        Cinemas: {
          Items: [
            {
              CinemaID: '1016',
              CinemaNameKR: '월드타워',
              DivisionCode: '1',
              DetailDivisionCode: '0001',
              Latitude: '37.5132941',
              Longitude: '127.104215',
              CinemaAddrSummary: '서울 송파구 올림픽로 300',
            },
          ],
        },
      },
      Movies: {
        Movies: {
          Items: [{ RepresentationMovieCode: '23816', MovieNameKR: '왕과 사는 남자' }],
        },
      },
    }),
  );
}

describe('handleLotteCinemaFindNearbyTheaters', () => {
  it('주변 지점을 반환한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const ctx = createMockContext({ lat: '37.5132941', lng: '127.104215' });
    await handleLotteCinemaFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ theaters: expect.any(Array) }),
      }),
    );
  });

  it('에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(new Error('lotte theater fail'));

    const ctx = createMockContext({});
    await handleLotteCinemaFindNearbyTheaters(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'LOTTECINEMA_THEATER_SEARCH_FAILED', message: 'lotte theater fail' },
      }),
      500,
    );
  });
});

describe('handleLotteCinemaListNowShowing', () => {
  it('영화/회차 목록을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createTicketingResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1201',
                  ScreenNameKR: '1관',
                  PlaySequence: '1',
                  PlayDt: '2026-03-10',
                  StartTime: '1040',
                  EndTime: '1247',
                  TotalSeatCount: '32',
                  BookingSeatCount: '28',
                },
              ],
            },
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260310', theaterId: '1016', movieId: '23816' });
    await handleLotteCinemaListNowShowing(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ movies: expect.any(Array), showtimes: expect.any(Array) }),
      }),
    );
  });
});

describe('handleLotteCinemaGetRemainingSeats', () => {
  it('잔여 좌석 목록을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createTicketingResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1201',
                  ScreenNameKR: '1관',
                  PlaySequence: '1',
                  PlayDt: '2026-03-10',
                  StartTime: '1040',
                  EndTime: '1247',
                  TotalSeatCount: '32',
                  BookingSeatCount: '28',
                },
              ],
            },
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260310', theaterId: '1016', movieId: '23816' });
    await handleLotteCinemaGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ seats: expect.any(Array) }),
      }),
    );
  });

  it('동일 시간 회차를 극장명으로 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            Cinemas: {
              Cinemas: {
                Items: [
                  {
                    CinemaID: '1000',
                    CinemaNameKR: '강남',
                    DivisionCode: '1',
                    DetailDivisionCode: '0001',
                    Latitude: '37.5',
                    Longitude: '127.0',
                    CinemaAddrSummary: '서울',
                  },
                  {
                    CinemaID: '2000',
                    CinemaNameKR: '코엑스',
                    DivisionCode: '1',
                    DetailDivisionCode: '0001',
                    Latitude: '37.5',
                    Longitude: '127.1',
                    CinemaAddrSummary: '서울',
                  },
                ],
              },
            },
            Movies: {
              Movies: {
                Items: [{ RepresentationMovieCode: '23816', MovieNameKR: '왕과 사는 남자' }],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1000',
                  CinemaNameKR: '강남',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1',
                  ScreenNameKR: '1관',
                  PlaySequence: '1',
                  PlayDt: '2026-03-10',
                  StartTime: '1040',
                  EndTime: '1247',
                  TotalSeatCount: '32',
                  BookingSeatCount: '28',
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '2000',
                  CinemaNameKR: '코엑스',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '2',
                  ScreenNameKR: '2관',
                  PlaySequence: '1',
                  PlayDt: '2026-03-10',
                  StartTime: '1040',
                  EndTime: '1247',
                  TotalSeatCount: '32',
                  BookingSeatCount: '20',
                },
              ],
            },
          }),
        ),
      );

    const ctx = createMockContext({ playDate: '20260310', movieId: '23816' });
    await handleLotteCinemaGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          seats: [
            expect.objectContaining({ theaterName: '강남' }),
            expect.objectContaining({ theaterName: '코엑스' }),
          ],
        }),
      }),
    );
  });

  it('알 수 없는 좌석 조회 에러를 처리한다', async () => {
    mockFetch.mockRejectedValue(null);

    const ctx = createMockContext({});
    await handleLotteCinemaGetRemainingSeats(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'LOTTECINEMA_SEAT_LIST_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });
});
