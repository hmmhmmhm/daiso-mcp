/**
 * 앱 통합 테스트 - 롯데시네마 API
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { __testOnlyClearLotteCinemaLocationCaches } from '../../src/services/lottecinema/location.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

beforeEach(() => {
  __testOnlyClearLotteCinemaLocationCaches();
});

afterEach(() => {
  __testOnlyClearLotteCinemaLocationCaches();
});

describe('GET /api/lottecinema/theaters', () => {
  it('롯데시네마 주변 지점을 반환한다', async () => {
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
          Movies: { Movies: { Items: [] } },
        }),
      ),
    );

    const res = await app.request('/api/lottecinema/theaters?lat=37.5&lng=127.1');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.theaters).toHaveLength(1);
  });

  it('위치 키워드로도 주변 지점을 반환한다', async () => {
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
            Movies: { Movies: { Items: [] } },
          }),
        ),
      );

    const res = await app.request('/api/lottecinema/theaters?keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.theaters[0].theaterId).toBe('9001');
  });
});

describe('GET /api/lottecinema/movies', () => {
  it('롯데시네마 영화/회차 목록을 반환한다', async () => {
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

    const res = await app.request('/api/lottecinema/movies?playDate=20260310&theaterId=1016&movieId=23816');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.movies).toHaveLength(1);
    expect(data.data.showtimes).toHaveLength(1);
  });

  it('위치 키워드로 최근접 극장을 찾아 영화/회차를 반환한다', async () => {
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

    const res = await app.request('/api/lottecinema/movies?playDate=20260310&keyword=안산%20중앙역&movieId=23816', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.filters.theaterId).toBe('9001');
    expect(data.data.showtimes).toHaveLength(1);
  });
});

describe('GET /api/lottecinema/seats', () => {
  it('롯데시네마 잔여 좌석 목록을 반환한다', async () => {
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

    const res = await app.request('/api/lottecinema/seats?playDate=20260310&theaterId=1016&movieId=23816');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.seats).toHaveLength(1);
  });
});
