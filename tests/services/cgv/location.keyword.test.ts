/**
 * CGV 위치 키워드 정규화 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearCgvLocationCaches,
  fetchCgvNearbyTheaters,
  resolveCgvLocation,
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

describe('CGV 위치 키워드 정규화', () => {
  it('복합 요청 문장에서도 위치 구간만 추출해 지오코드한다', async () => {
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
      {
        keyword: 'CGV 안산 중앙역 근처 극장 찾고 오늘 하는 영화 목록 찾고 남은 좌석수 찾아주세요',
      },
      { googleMapsApiKey: 'test-google-key' },
    );

    const requestUrl = new URL(mockFetch.mock.calls[0]?.[0] as string);

    expect(requestUrl.searchParams.get('address')).toBe('안산 중앙역');
    expect(result.keyword).toBe('안산 중앙역');
    expect(result.latitude).toBe(37.3171);
    expect(result.longitude).toBe(126.8389);
  });

  it('정규화 결과가 비면 원래 키워드를 유지한다', async () => {
    const result = await resolveCgvLocation({ keyword: 'CGV' });

    expect(result).toEqual({
      keyword: 'CGV',
      latitude: null,
      longitude: null,
      geocodeUsed: false,
      formattedAddress: null,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('정규화된 위치로 가까운 극장을 고른다', async () => {
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
                  { siteNo: '0327', siteNm: '배곧' },
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
        keyword: 'CGV 안산 중앙역 근처 극장 찾고 오늘 하는 영화 목록 찾고 남은 좌석수 찾아주세요',
      },
      { googleMapsApiKey: 'test-google-key' },
    );

    expect(result.keyword).toBe('안산 중앙역');
    expect(result.theaters[0]?.theaterCode).toBe('0211');
    expect(result.theaters).toHaveLength(1);
  });
});
