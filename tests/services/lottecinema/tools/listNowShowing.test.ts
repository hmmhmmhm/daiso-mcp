/**
 * 롯데시네마 영화 목록 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteCinemaLocationCaches } from '../../../../src/services/lottecinema/location.js';
import { createListNowShowingTool } from '../../../../src/services/lottecinema/tools/listNowShowing.js';

const mockFetch = vi.fn();
const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  __testOnlyClearLotteCinemaLocationCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
  __testOnlyClearLotteCinemaLocationCaches();
  process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
});

describe('createListNowShowingTool', () => {
  it('필터가 없으면 기본 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
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
    );

    const tool = createListNowShowingTool();
    const result = await tool.handler({ playDate: '20260310' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filters.theaterId).toBeNull();
    expect(parsed.counts.movies).toBe(1);
    expect(parsed.counts.showtimes).toBe(0);
  });

  it('위치 키워드로 최근접 극장을 찾아 영화/회차를 조회한다', async () => {
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

    const tool = createListNowShowingTool('test-google-key');
    const result = await tool.handler({ playDate: '20260310', keyword: '안산 중앙역' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filters.theaterId).toBe('9001');
    expect(parsed.resolvedTheater.theaterName).toBe('안산중앙');
    expect(parsed.counts.showtimes).toBe(1);
  });

  it('위치 키워드로 극장을 찾지 못하면 빈 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
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
    );

    process.env.GOOGLE_MAPS_API_KEY = '';
    const tool = createListNowShowingTool();
    const result = await tool.handler({ playDate: '20260310', keyword: '제주공항' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filters.theaterId).toBeNull();
    expect(parsed.resolvedTheater).toBeNull();
    expect(parsed.counts.showtimes).toBe(0);
  });
});
