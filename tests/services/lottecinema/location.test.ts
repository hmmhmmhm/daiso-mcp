/**
 * 롯데시네마 위치 해석 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearLotteCinemaLocationCaches,
  fetchLotteCinemaNearbyTheaters,
  resolveLotteCinemaLocation,
  resolveLotteCinemaNearestTheater,
} from '../../../src/services/lottecinema/location.js';

const mockFetch = vi.fn();

function createTicketingResponse() {
  return new Response(
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
            {
              CinemaID: '9002',
              CinemaNameKR: '안산',
              DivisionCode: '9',
              DetailDivisionCode: '0001',
              Latitude: '37.316',
              Longitude: '126.83',
              CinemaAddrSummary: '경기 안산시 단원구 고잔동 700',
            },
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
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  __testOnlyClearLotteCinemaLocationCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
  __testOnlyClearLotteCinemaLocationCaches();
});

describe('resolveLotteCinemaLocation', () => {
  it('명시된 좌표를 그대로 사용한다', async () => {
    const resolved = await resolveLotteCinemaLocation({
      keyword: '안산 중앙역',
      latitude: 37.3172,
      longitude: 126.839,
    });

    expect(resolved.latitude).toBe(37.3172);
    expect(resolved.longitude).toBe(126.839);
    expect(resolved.geocodeUsed).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('구글 지오코드 결과를 캐시한다', async () => {
    mockFetch.mockResolvedValue(
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

    const first = await resolveLotteCinemaLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );
    const second = await resolveLotteCinemaLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(first.geocodeUsed).toBe(true);
    expect(first.formattedAddress).toContain('안산시');
    expect(second.latitude).toBe(37.3172);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('지오코드 실패 결과도 캐시한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      ),
    );

    const first = await resolveLotteCinemaLocation(
      { keyword: '존재하지않는역' },
      { googleMapsApiKey: 'test-google-key' },
    );
    const second = await resolveLotteCinemaLocation(
      { keyword: '존재하지않는역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(first.latitude).toBeNull();
    expect(second.longitude).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('지오코드 주소가 없으면 formattedAddress를 null로 둔다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              geometry: {
                location: { lat: 37.3172, lng: 126.839 },
              },
            },
          ],
        }),
      ),
    );

    const resolved = await resolveLotteCinemaLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(resolved.geocodeUsed).toBe(true);
    expect(resolved.formattedAddress).toBeNull();
  });

  it('위치 정보가 없으면 null 좌표를 반환한다', async () => {
    const resolved = await resolveLotteCinemaLocation({});

    expect(resolved.keyword).toBeNull();
    expect(resolved.latitude).toBeNull();
    expect(resolved.longitude).toBeNull();
  });
});

describe('fetchLotteCinemaNearbyTheaters', () => {
  it('좌표 기준으로 가까운 극장을 거리순 정렬한다', async () => {
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
      .mockResolvedValueOnce(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters(
      { keyword: '안산 중앙역', playDate: '20260315', limit: 2 },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.geocodeUsed).toBe(true);
    expect(result.theaters[0].theaterId).toBe('9001');
    expect(result.theaters[0].distanceKm).toBeLessThan(result.theaters[1].distanceKm as number);
  });

  it('지오코드 없이도 키워드 매칭으로 극장을 찾는다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters({
      keyword: '안산 중앙역',
      playDate: '20260315',
      limit: 2,
    });

    expect(result.count).toBe(2);
    expect(result.theaters[0].theaterName).toBe('안산중앙');
    expect(result.theaters[0].distanceKm).toBeNull();
  });

  it('극장명이 아니라 주소로도 키워드 매칭을 수행한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters({
      keyword: '고잔동',
      playDate: '20260315',
      limit: 2,
    });

    expect(result.count).toBe(2);
    expect(result.theaters[0].address).toContain('고잔동');
  });

  it('주소가 비어 있어도 극장명으로 키워드 매칭을 수행한다', async () => {
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
                  CinemaAddrSummary: '',
                },
              ],
            },
          },
          Movies: { Movies: { Items: [] } },
        }),
      ),
    );

    const result = await fetchLotteCinemaNearbyTheaters({
      keyword: '월드타워',
      playDate: '20260315',
      limit: 2,
    });

    expect(result.count).toBe(1);
    expect(result.theaters[0].theaterName).toBe('월드타워');
  });

  it('불용어만 있으면 매칭 결과를 비운다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters({
      keyword: '영화',
      playDate: '20260315',
      limit: 2,
    });

    expect(result.count).toBe(0);
    expect(result.theaters).toEqual([]);
  });

  it('limit이 음수여도 최소 1개는 반환한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters({
      latitude: 37.3172,
      longitude: 126.839,
      playDate: '20260315',
      limit: -2,
    });

    expect(result.count).toBe(1);
    expect(result.theaters).toHaveLength(1);
  });

  it('limit이 없으면 기본값 10을 사용한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters({
      latitude: 37.3172,
      longitude: 126.839,
      playDate: '20260315',
    });

    expect(result.count).toBe(3);
    expect(result.theaters).toHaveLength(3);
  });

  it('동일 거리면 극장명 순으로 정렬한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          IsOK: true,
          Cinemas: {
            Cinemas: {
              Items: [
                {
                  CinemaID: '2000',
                  CinemaNameKR: '코엑스',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5',
                  Longitude: '127.1',
                  CinemaAddrSummary: '서울',
                },
                {
                  CinemaID: '1000',
                  CinemaNameKR: '강남',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5',
                  Longitude: '127.1',
                  CinemaAddrSummary: '서울',
                },
              ],
            },
          },
          Movies: { Movies: { Items: [] } },
        }),
      ),
    );

    const result = await fetchLotteCinemaNearbyTheaters({
      latitude: 37.5,
      longitude: 127.1,
      playDate: '20260315',
      limit: 2,
    });

    expect(result.theaters[0].theaterName).toBe('강남');
    expect(result.theaters[1].theaterName).toBe('코엑스');
  });
});

describe('resolveLotteCinemaNearestTheater', () => {
  it('매칭되는 극장이 없으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValue(createTicketingResponse());

    const result = await resolveLotteCinemaNearestTheater({
      keyword: '제주공항',
      playDate: '20260315',
    });

    expect(result.location.keyword).toBe('제주공항');
    expect(result.theater).toBeNull();
  });
});
