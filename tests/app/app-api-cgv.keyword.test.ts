/**
 * 앱 통합 테스트 - CGV 자연어 위치 키워드
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { __testOnlyClearCgvLocationCaches } from '../../src/services/cgv/location.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

beforeEach(() => {
  __testOnlyClearCgvLocationCaches();
});

describe('GET /api/cgv/movies keyword normalization', () => {
  it('복합 요청 문장에서도 안산 극장을 선택한다', async () => {
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [{ movNo: '30000985', movNm: '영화A', cratgClsNm: '12세' }],
          }),
        ),
      );

    const keyword = encodeURIComponent(
      'CGV 안산 중앙역 근처 극장 찾고 오늘 하는 영화 목록 찾고 남은 좌석수 찾아주세요',
    );
    const res = await app.request(`/api/cgv/movies?playDate=20260315&keyword=${keyword}`, undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.filters.theaterCode).toBe('0211');
    expect(data.data.resolvedTheater.theaterCode).toBe('0211');
    expect(data.data.movies).toHaveLength(1);
  });
});
