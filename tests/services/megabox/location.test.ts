/**
 * 메가박스 위치 해석 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearMegaboxLocationCaches,
  fetchMegaboxNearbyTheaters,
  resolveMegaboxLocation,
  resolveMegaboxNearestTheater,
} from '../../../src/services/megabox/location.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearMegaboxLocationCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolveMegaboxLocation', () => {
  it('명시적인 좌표와 지역 코드를 그대로 사용한다', async () => {
    const result = await resolveMegaboxLocation({
      latitude: 37.3171,
      longitude: 126.8389,
      areaCode: '41',
    });

    expect(result).toEqual({
      keyword: null,
      latitude: 37.3171,
      longitude: 126.8389,
      areaCode: '41',
      geocodeUsed: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('키워드를 구글 지오코드로 보강해 좌표와 지역 코드를 찾는다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ documents: [{ place_name: '안산 중앙역', address_name: '대한민국 경기도 안산시 단원구 고잔동', y: 37.3171, x: 126.8389 }] }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '안산 중앙역' },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result).toEqual({
      keyword: '안산 중앙역',
      latitude: 37.3171,
      longitude: 126.8389,
      areaCode: '41',
      geocodeUsed: true,
    });
  });

  it('지역 코드를 찾지 못해도 좌표는 사용하고 지역 코드는 기본값으로 둔다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ documents: [{ place_name: '안산 중앙역', address_name: '대한민국 어딘가', y: 35.1234, x: 128.1234 }] }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '어딘가' },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result.latitude).toBe(35.1234);
    expect(result.longitude).toBe(128.1234);
    expect(result.areaCode).toBe('11');
    expect(result.geocodeUsed).toBe(true);
  });
});

describe('fetchMegaboxNearbyTheaters', () => {
  it('지오코드된 위치 기준으로 근처 극장을 거리순 정렬한다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [{ place_name: '안산 중앙역', address_name: '대한민국 경기도 안산시 단원구', y: 37.3171, x: 126.8389 }] }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [
              { brchNo: '4431', brchNm: '안산중앙' },
              { brchNo: '4432', brchNm: '고잔' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8500&lat=37.3300">지도</a>'),
      );

    const result = await fetchMegaboxNearbyTheaters(
      { keyword: '안산 중앙역', playDate: '20260315', limit: 2 },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('41');
    expect(result.geocodeUsed).toBe(true);
    expect(result.theaters[0].theaterId).toBe('4431');
    expect(result.theaters[0].distanceKm).toBe(0);
  });

  it('nearest theater를 자동으로 선택한다', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-free-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [{ place_name: '안산 중앙역', address_name: '대한민국 경기도 안산시 단원구', y: 37.3171, x: 126.8389 }] }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      );

    const result = await resolveMegaboxNearestTheater(
      { keyword: '안산 중앙역', playDate: '20260315' },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result.location.areaCode).toBe('41');
    expect(result.theater?.theaterId).toBe('4431');
  });

  it('limit가 0이어도 최소 1건 기준으로 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      );

    const result = await fetchMegaboxNearbyTheaters(
      {
        latitude: 37.3171,
        longitude: 126.8389,
        areaCode: '41',
        playDate: '20260315',
        limit: 0,
      },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result.count).toBe(1);
  });

  it('가까운 지점이 없으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
        }),
      ),
    ).mockRejectedValueOnce(new Error('detail failed'));

    const result = await resolveMegaboxNearestTheater(
      {
        latitude: 37.3171,
        longitude: 126.8389,
        areaCode: '41',
        playDate: '20260315',
      },
      { kakaoRestApiKey: 'test-google-key' },
    );

    expect(result.location.areaCode).toBe('41');
    expect(result.theater).toBeNull();
  });
});
describe('무료 위치 해석 계약', () => {
 it('키워드 검색 실패는 서울 성공으로 대체하지 않는다', async () => {
  await expect(resolveMegaboxLocation({ keyword: '부산역' })).rejects.toThrow('위치를 좌표로 변환하지 못했습니다');
 });
 it('좌표를 명시하면 사용자 지오코딩을 생략하고 전체 지역을 검색한다', async () => {
  const result = await resolveMegaboxLocation({ latitude: 35.115, longitude: 129.041 });
  expect(result).toMatchObject({ latitude: 35.115, longitude: 129.041, areaCode: '', geocodeUsed: false });
  expect(mockFetch).not.toHaveBeenCalled();
 });
 it('부산역 주소에서 부산 지역을 결정한다', async () => {
  mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ documents: [{ place_name: '부산역', address_name: '부산 동구', x: '129.041', y: '35.115' }] })));
  expect(await resolveMegaboxLocation({ keyword: '부산역' }, { kakaoRestApiKey: 'free' })).toMatchObject({ areaCode: '26', latitude: 35.115 });
 });
});
