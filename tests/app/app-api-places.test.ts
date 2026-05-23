/**
 * 앱 통합 테스트 - 장소 검색 API
 */
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/places/search', () => {
  it('네이버 지역 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          items: [
            {
              title: '<b>강남</b> 카페',
              category: '카페,디저트>카페',
              address: '서울 강남구',
              roadAddress: '서울 강남구 강남대로',
              mapx: '1270000000',
              mapy: '375000000',
            },
          ],
        }),
      ),
    );

    const res = await app.request(
      '/api/places/search?location=강남역&category=cafe&limit=5&sort=comment',
      undefined,
      {
        NAVER_CLIENT_ID: 'client-id',
        NAVER_CLIENT_SECRET: 'client-secret',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.query).toBe('강남역 카페');
    expect(data.data.places[0].name).toBe('강남 카페');
  });

  it('location과 keyword가 모두 없으면 오류를 반환한다', async () => {
    const res = await app.request('/api/places/search?category=cafe');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_QUERY');
  });

  it('네이버 설정이 없으면 검색 실패 응답을 반환한다', async () => {
    const res = await app.request('/api/places/search?location=강남역&category=unknown');

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('PLACES_SEARCH_FAILED');
    expect(data.error.message).toContain('NAVER_CLIENT_ID');
  });
});
