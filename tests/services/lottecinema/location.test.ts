/**
 * 롯데시네마 위치 해석 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearLotteCinemaLocationCaches,
  fetchLotteCinemaNearbyTheaters,
  resolveLotteCinemaLocation,
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
  vi.unstubAllEnvs();
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

  it('지오코드 주소가 없으면 formattedAddress를 null로 둔다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ documents: [{ place_name: '안산 중앙역', address_name: '', y: 37.3172, x: 126.839 }] }),
      ),
    );

    const resolved = await resolveLotteCinemaLocation(
      { keyword: '안산 중앙역' },
      { kakaoRestApiKey: 'test-google-key' },
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
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [{ place_name: '안산 중앙역', address_name: '대한민국 경기도 안산시 단원구 고잔동 535', y: 37.3172, x: 126.839 }] }),
        ),
      )
      .mockResolvedValueOnce(createTicketingResponse());

    const result = await fetchLotteCinemaNearbyTheaters(
      { keyword: '안산 중앙역', playDate: '20260315', limit: 2 },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result.geocodeUsed).toBe(true);
    expect(result.theaters[0].theaterId).toBe('9001');
    expect(result.theaters[0].distanceKm).toBeLessThan(result.theaters[1].distanceKm as number);
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



it.each(['안산 중앙역', '고잔동', '안산중앙', '극장', '없는곳'])('무료 위치 해석에 실패한 %s는 거리 없는 성공으로 대체하지 않는다', async (keyword) => {
 await expect(fetchLotteCinemaNearbyTheaters({ keyword, playDate: '20261005' })).rejects.toThrow('위치를 좌표로 변환하지 못했습니다');
 expect(mockFetch).not.toHaveBeenCalled();
});
it('한국 범위 밖 좌표는 조회에 사용하지 않는다', async () => {
 await expect(resolveLotteCinemaLocation({ latitude: 0, longitude: 0 })).rejects.toThrow('유효한 위도');
});
it('위치 입력이나 극장 좌표가 없으면 가까운 극장을 만들지 않는다', async () => {
 mockFetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ IsOK: true, Cinemas: { Cinemas: { Items: [] } }, Movies: { Movies: { Items: [] } } }))));
 const { resolveLotteCinemaNearestTheater } = await import('../../../src/services/lottecinema/location.js');
 expect((await fetchLotteCinemaNearbyTheaters({ playDate: '20261005' })).theaters).toEqual([]);
 expect((await resolveLotteCinemaNearestTheater({ latitude: 35.115, longitude: 129.041, playDate: '20261005' })).theater).toBeNull();
});
