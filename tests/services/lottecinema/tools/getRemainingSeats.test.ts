/**
 * 롯데시네마 잔여 좌석 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGetRemainingSeatsTool } from '../../../../src/services/lottecinema/tools/getRemainingSeats.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
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
});
