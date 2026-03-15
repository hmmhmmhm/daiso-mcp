/**
 * 롯데시네마 잔여 좌석 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteCinemaLocationCaches } from '../../../../src/services/lottecinema/location.js';
import { createGetRemainingSeatsTool } from '../../../../src/services/lottecinema/tools/getRemainingSeats.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  __testOnlyClearLotteCinemaLocationCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
  __testOnlyClearLotteCinemaLocationCaches();
});

describe('createGetRemainingSeatsTool', () => {
  it('회차별 잔여 좌석을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
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
                Items: [
                  {
                    RepresentationMovieCode: '23816',
                    MovieNameKR: '왕과 사는 남자',
                  },
                ],
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
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                  ScreenID: '1201',
                  ScreenNameKR: '1관',
                  PlaySequence: '2',
                  PlayDt: '2026-03-10',
                  StartTime: '1320',
                  EndTime: '1527',
                  TotalSeatCount: '32',
                  BookingSeatCount: '27',
                },
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

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260310', theaterId: '1016', movieId: '23816' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.count).toBe(2);
    expect(parsed.seats[0].startTime).toBe('10:40');
    expect(parsed.seats[0].remainingSeats).toBe(4);
  });

  it('동일 시작 시간은 극장명으로 정렬한다', async () => {
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
      );

    const tool = createGetRemainingSeatsTool();
    const result = await tool.handler({ playDate: '20260310', movieId: '23816' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.seats[0].theaterName).toBe('강남');
    expect(parsed.seats[1].theaterName).toBe('코엑스');
  });

  it('위치 키워드로 최근접 극장을 찾아 좌석을 조회한다', async () => {
    mockFetch
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
            IsOK: true,
            Cinemas: {
              Cinemas: {
                Items: [
                  {
                    CinemaID: '9001',
                    CinemaNameKR: '안산중앙',
                    DivisionCode: '9',
                    DetailDivisionCode: '0001',
                    Latitude: '37.3172',
                    Longitude: '126.839',
                    CinemaAddrSummary: '경기 안산시 단원구 고잔동 중앙대로 123',
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
            Cinemas: {
              Cinemas: {
                Items: [
                  {
                    CinemaID: '9001',
                    CinemaNameKR: '안산중앙',
                    DivisionCode: '9',
                    DetailDivisionCode: '0001',
                    Latitude: '37.3172',
                    Longitude: '126.839',
                    CinemaAddrSummary: '경기 안산시 단원구 고잔동 중앙대로 123',
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
                  CinemaID: '9001',
                  CinemaNameKR: '안산중앙',
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
      );

    const tool = createGetRemainingSeatsTool('test-google-key');
    const result = await tool.handler({ playDate: '20260310', keyword: '안산 중앙역', movieId: '23816' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filters.theaterId).toBe('9001');
    expect(parsed.resolvedTheater.theaterName).toBe('안산중앙');
    expect(parsed.seats[0].remainingSeats).toBe(4);
  });
});
