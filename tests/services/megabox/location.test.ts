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
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              formatted_address: '대한민국 경기도 안산시 단원구 고잔동',
              geometry: {
                location: { lat: 37.3171, lng: 126.8389 },
              },
            },
          ],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result).toEqual({
      keyword: '안산 중앙역',
      latitude: 37.3171,
      longitude: 126.8389,
      areaCode: '41',
      geocodeUsed: true,
    });
  });

  it('지오코드 address_components의 short_name으로도 지역 코드를 찾는다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              address_components: [{ long_name: '', short_name: '경기도' }],
              geometry: {
                location: { lat: 37.3171, lng: 126.8389 },
              },
            },
          ],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('41');
    expect(result.latitude).toBe(37.3171);
    expect(result.longitude).toBe(126.8389);
    expect(result.geocodeUsed).toBe(true);
  });

  it('좌표만 있어도 역지오코드로 지역 코드를 보강한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              address_components: [{ long_name: '경기도' }],
              geometry: {
                location: { lat: 37.3171, lng: 126.8389 },
              },
            },
          ],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { latitude: 37.3171, longitude: 126.8389 },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('41');
    expect(result.geocodeUsed).toBe(true);
  });

  it('지오코드 실패 시 기본 서울 좌표와 지역 코드를 사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '없는 위치' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('11');
    expect(result.latitude).toBe(37.5665);
    expect(result.longitude).toBe(126.978);
    expect(result.geocodeUsed).toBe(false);
  });

  it('지오코드가 OK여도 결과가 비면 기본 서울 좌표와 지역 코드를 사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '결과없음' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('11');
    expect(result.latitude).toBe(37.5665);
    expect(result.longitude).toBe(126.978);
    expect(result.geocodeUsed).toBe(false);
  });

  it('지역 코드를 찾지 못해도 좌표는 사용하고 지역 코드는 기본값으로 둔다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              formatted_address: '대한민국 어딘가',
              geometry: {
                location: { lat: 35.1234, lng: 128.1234 },
              },
            },
          ],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '어딘가' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.latitude).toBe(35.1234);
    expect(result.longitude).toBe(128.1234);
    expect(result.areaCode).toBe('11');
    expect(result.geocodeUsed).toBe(true);
  });

  it('같은 키워드 지오코드 결과를 캐시에서 재사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
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
    );

    const first = await resolveMegaboxLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );
    const second = await resolveMegaboxLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(first.areaCode).toBe('41');
    expect(second.areaCode).toBe('41');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('좌표 없는 지오코드 결과는 null로 처리한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [{}],
        }),
      ),
    );

    const result = await resolveMegaboxLocation(
      { keyword: '좌표없는결과' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('11');
    expect(result.latitude).toBe(37.5665);
    expect(result.longitude).toBe(126.978);
    expect(result.geocodeUsed).toBe(false);
  });
});

describe('fetchMegaboxNearbyTheaters', () => {
  it('지오코드된 위치 기준으로 근처 극장을 거리순 정렬한다', async () => {
    mockFetch
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
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.areaCode).toBe('41');
    expect(result.geocodeUsed).toBe(true);
    expect(result.theaters[0].theaterId).toBe('4431');
    expect(result.theaters[0].distanceKm).toBe(0);
  });

  it('nearest theater를 자동으로 선택한다', async () => {
    mockFetch
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
            areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      );

    const result = await resolveMegaboxNearestTheater(
      { keyword: '안산 중앙역', playDate: '20260315' },
      { googleMapsApiKey: 'test-google-key' },
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
      { googleMapsApiKey: 'test-google-key' },
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
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.location.areaCode).toBe('41');
    expect(result.theater).toBeNull();
  });
});
