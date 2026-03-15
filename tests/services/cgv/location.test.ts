/**
 * CGV 위치 해석 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearCgvLocationCaches,
  fetchCgvNearbyTheaters,
  resolveCgvLocation,
  resolveCgvNearestTheater,
} from '../../../src/services/cgv/location.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearCgvLocationCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveCgvLocation', () => {
  it('명시적인 좌표를 그대로 사용한다', async () => {
    const result = await resolveCgvLocation({
      keyword: '안산 중앙역',
      latitude: 37.3171,
      longitude: 126.8389,
    });

    expect(result).toEqual({
      keyword: '안산 중앙역',
      latitude: 37.3171,
      longitude: 126.8389,
      geocodeUsed: false,
      formattedAddress: null,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('키워드를 구글 지오코드로 보강한다', async () => {
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

    const result = await resolveCgvLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result).toEqual({
      keyword: '안산 중앙역',
      latitude: 37.3171,
      longitude: 126.8389,
      geocodeUsed: true,
      formattedAddress: '대한민국 경기도 안산시 단원구 고잔동',
    });
  });

  it('formatted_address가 없어도 좌표는 사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              geometry: {
                location: { lat: 37.3171, lng: 126.8389 },
              },
            },
          ],
        }),
      ),
    );

    const result = await resolveCgvLocation(
      { keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.latitude).toBe(37.3171);
    expect(result.longitude).toBe(126.8389);
    expect(result.formattedAddress).toBeNull();
  });

  it('지오코드 결과가 없으면 빈 좌표를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      ),
    );

    const result = await resolveCgvLocation(
      { keyword: '없는 위치' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.geocodeUsed).toBe(false);
    expect(result.formattedAddress).toBeNull();
  });

  it('키워드와 좌표가 모두 없으면 빈 위치를 반환한다', async () => {
    const result = await resolveCgvLocation({});

    expect(result).toEqual({
      keyword: null,
      latitude: null,
      longitude: null,
      geocodeUsed: false,
      formattedAddress: null,
    });
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

    await resolveCgvLocation({ keyword: '안산 중앙역' }, { googleMapsApiKey: 'test-google-key' });
    await resolveCgvLocation({ keyword: '안산 중앙역' }, { googleMapsApiKey: 'test-google-key' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchCgvNearbyTheaters', () => {
  it('키워드와 극장명 지오코드를 사용해 가까운 극장을 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [
                  { siteNo: '0211', siteNm: '안산' },
                  { siteNo: '0212', siteNm: '야탑' },
                ],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
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
      )
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
      );

    const result = await fetchCgvNearbyTheaters(
      {
        playDate: '20260315',
        keyword: '안산 중앙역',
      },
      {
        googleMapsApiKey: 'test-google-key',
      },
    );

    expect(result.keyword).toBe('안산 중앙역');
    expect(result.theaters[0].theaterCode).toBe('0211');
    expect(result.theaters[0].distanceKm).toBeTypeOf('number');
    expect(result.theaters[0].address).toContain('안산시');
  });

  it('구글 키가 없어도 극장명 토큰으로 후보를 찾는다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '02',
              regnGrpNm: '경기',
              siteList: [
                { siteNo: '0212', siteNm: '안산중앙' },
                { siteNo: '0211', siteNm: '안산' },
                { siteNo: '0056', siteNm: '강남' },
              ],
            },
          ],
        }),
      ),
    );

    const result = await fetchCgvNearbyTheaters({
      playDate: '20260315',
      keyword: '안산 중앙역',
    });

    expect(result.theaters).toHaveLength(2);
    expect(result.theaters[0].theaterCode).toBe('0211');
    expect(result.theaters[1].theaterCode).toBe('0212');
    expect(result.theaters[0].distanceKm).toBeNull();
  });

  it('키워드와 매칭되는 극장이 없으면 빈 결과를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const result = await fetchCgvNearbyTheaters({
      playDate: '20260315',
      keyword: '안산 중앙역',
    });

    expect(result.count).toBe(0);
    expect(result.theaters).toEqual([]);
  });

  it('좌표만 있고 구글 키가 없으면 임의 근처 극장을 만들지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const result = await fetchCgvNearbyTheaters({
      playDate: '20260315',
      latitude: 37.3171,
      longitude: 126.8389,
    });

    expect(result.count).toBe(0);
    expect(result.theaters).toEqual([]);
  });

  it('좌표와 구글 키가 있으면 토큰이 없어도 후보 극장을 거리순으로 계산한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [
                  { siteNo: '0212', siteNm: '야탑' },
                  { siteNo: '0211', siteNm: '안산' },
                ],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 성남시 분당구',
                geometry: {
                  location: { lat: 37.411, lng: 127.128 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      );

    const result = await fetchCgvNearbyTheaters(
      {
        playDate: '20260315',
        latitude: 37.3171,
        longitude: 126.8389,
      },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.theaters[0].theaterCode).toBe('0211');
    expect(result.theaters[0].distanceKm).toBeCloseTo(0.01, 2);
  });

  it('stopword만 있는 키워드는 토큰으로 사용하지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const result = await fetchCgvNearbyTheaters({
      playDate: '20260315',
      keyword: 'CGV 역',
    });

    expect(result.count).toBe(0);
    expect(result.theaters).toEqual([]);
  });
});

describe('resolveCgvNearestTheater', () => {
  it('가장 가까운 극장을 선택한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
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
      )
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
      );

    const result = await resolveCgvNearestTheater(
      { playDate: '20260315', keyword: '안산 중앙역' },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.location.keyword).toBe('안산 중앙역');
    expect(result.theater?.theaterCode).toBe('0211');
  });

  it('후보가 없으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [],
        }),
      ),
    );

    const result = await resolveCgvNearestTheater({ playDate: '20260315', keyword: '안산 중앙역' });
    expect(result.theater).toBeNull();
  });
});
