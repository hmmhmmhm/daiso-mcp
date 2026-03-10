/**
 * 롯데시네마 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLotteCinemaNowShowing,
  fetchLotteCinemaTicketingPage,
  toYyyymmdd,
} from '../../../src/services/lottecinema/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTicketingResponse() {
  return new Response(
    JSON.stringify({
      IsOK: true,
      ResultMessage: 'SUCCESS',
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
            {
              CinemaID: '1001',
              CinemaNameKR: '건대입구',
              DivisionCode: '1',
              DetailDivisionCode: '0001',
              Latitude: '37.5405',
              Longitude: '127.0693',
              CinemaAddrSummary: '서울 광진구 아차산로 262',
            },
          ],
        },
      },
      Movies: {
        Movies: {
          Items: [
            {
              RepresentationMovieCode: '23816',
              MovieNameKR: '왕과 사는 남자',
              ViewGradeNameKR: '12세이상관람가',
              PlayTime: '127',
              ReleaseDate: '2026-03-10',
            },
            {
              RepresentationMovieCode: '24024',
              MovieNameKR: '굿 윌 헌팅',
              ViewGradeNameKR: '15세이상관람가',
              PlayTime: '126',
              ReleaseDate: '2026-03-01',
            },
          ],
        },
      },
    }),
  );
}

describe('fetchLotteCinemaTicketingPage', () => {
  it('극장/영화 목록을 정규화한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaTicketingPage();

    expect(result.theaters[0].theaterId).toBe('1016');
    expect(result.theaters[0].latitude).toBe(37.5132941);
    expect(result.movies[0].movieId).toBe('23816');
    expect(result.movies[0].durationMinutes).toBe(127);
  });

  it('HTTP 에러를 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response('fail', { status: 500 }));

    await expect(fetchLotteCinemaTicketingPage()).rejects.toThrow('롯데시네마 API 호출 실패: 500');
  });

  it('AbortError를 시간 초과 에러로 변환한다', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(fetchLotteCinemaTicketingPage()).rejects.toThrow('롯데시네마 API 호출 시간 초과');
  });

  it('비어 있는 좌표와 누락된 상영시간은 null/undefined로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          IsOK: true,
          ResultMessage: 'SUCCESS',
          Cinemas: {
            Cinemas: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '',
                  Longitude: null,
                  CinemaAddrSummary: '서울 송파구 올림픽로 300',
                },
              ],
            },
          },
          Movies: {
            Movies: {
              Items: [
                {
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ViewGradeNameKR: null,
                },
              ],
            },
          },
        }),
      ),
    );

    const result = await fetchLotteCinemaTicketingPage();

    expect(result.theaters[0].latitude).toBeNull();
    expect(result.theaters[0].longitude).toBeNull();
    expect(result.movies[0].durationMinutes).toBeUndefined();
    expect(result.movies[0].rating).toBeUndefined();
  });

  it('IsOK=false 응답을 실패로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          IsOK: false,
          ResultMessage: 'FAIL',
        }),
      ),
    );

    await expect(fetchLotteCinemaTicketingPage()).rejects.toThrow('롯데시네마 API 응답 실패: FAIL');
  });
});

describe('fetchLotteCinemaNowShowing', () => {
  it('필터가 없으면 기본 극장/영화 목록과 빈 회차를 반환한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNowShowing({ playDate: '20260310' });

    expect(result.theaters).toHaveLength(2);
    expect(result.movies).toHaveLength(2);
    expect(result.showtimes).toHaveLength(0);
  });

  it('극장/영화 조합별 회차를 정규화한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createTicketingResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            ResultMessage: 'SUCCESS',
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1201',
                  ScreenNameKR: '1관 샤롯데',
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
        new Response(JSON.stringify({ IsOK: true, ResultMessage: 'SUCCESS', PlaySeqs: { Items: [] } })),
      );

    const result = await fetchLotteCinemaNowShowing({ playDate: '20260310', theaterId: '1016' });

    expect(result.theaters).toHaveLength(1);
    expect(result.movies).toHaveLength(1);
    expect(result.showtimes[0].scheduleId).toBe('20260310-1016-1201-1');
    expect(result.showtimes[0].remainingSeats).toBe(4);
  });

  it('movieId만 있으면 여러 극장을 순회해 회차를 모은다', async () => {
    mockFetch
      .mockResolvedValueOnce(createTicketingResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            ResultMessage: 'SUCCESS',
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1201',
                  ScreenNameKR: '1관 샤롯데',
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
            ResultMessage: 'SUCCESS',
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1001',
                  CinemaNameKR: '건대입구',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '2201',
                  ScreenNameKR: '2관',
                  PlaySequence: '2',
                  PlayDt: '2026-03-10',
                  StartTime: '1320',
                  EndTime: '1527',
                  TotalSeatCount: '100',
                  BookingSeatCount: '10',
                },
              ],
            },
          }),
        ),
      );

    const result = await fetchLotteCinemaNowShowing({ playDate: '20260310', movieId: '23816' });

    expect(result.theaters).toHaveLength(2);
    expect(result.movies).toHaveLength(1);
    expect(result.showtimes).toHaveLength(2);
  });

  it('playDate가 하이픈 형식이어도 회차를 정규화한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createTicketingResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            ResultMessage: 'SUCCESS',
            PlaySeqs: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1201',
                  ScreenNameKR: '1관 샤롯데',
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
        new Response(JSON.stringify({ IsOK: true, ResultMessage: 'SUCCESS', PlaySeqs: { Items: [] } })),
      );

    const result = await fetchLotteCinemaNowShowing({ playDate: '2026-03-10', theaterId: '1016' });

    expect(result.showtimes[0].playDate).toBe('20260310');
  });

  it('존재하지 않는 극장/영화 필터면 빈 회차를 반환한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNowShowing({ playDate: '20260310', theaterId: '9999' });

    expect(result.theaters).toHaveLength(0);
    expect(result.showtimes).toHaveLength(0);
  });
});

describe('toYyyymmdd', () => {
  it('Date를 YYYYMMDD로 변환한다', () => {
    expect(toYyyymmdd(new Date('2026-03-10T00:00:00.000Z'))).toBe('20260310');
  });
});
