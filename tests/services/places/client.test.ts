/**
 * 네이버 지역 검색 클라이언트 테스트
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildNaverLocalQuery,
  searchNaverLocalPlaces,
} from '../../../src/services/places/client.js';

describe('buildNaverLocalQuery', () => {
  it('위치와 카테고리 또는 직접 검색어로 네이버 지역 검색어를 만든다', () => {
    expect(buildNaverLocalQuery({ location: '성수동', category: 'restaurant' })).toBe(
      '성수동 음식점',
    );
    expect(buildNaverLocalQuery({ location: '성수동', keyword: '브런치', category: 'cafe' })).toBe(
      '성수동 브런치',
    );
    expect(buildNaverLocalQuery({ keyword: '강남역 라멘', category: 'all' })).toBe('강남역 라멘');
  });
});

describe('searchNaverLocalPlaces', () => {
  it('네이버 지역 검색 응답을 주변 장소 결과로 정규화한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          start: 1,
          display: 1,
          items: [
            {
              title: '팀홀튼 <b>강남역</b>대륭타워점',
              link: 'https://example.com',
              category: '카페,디저트>카페',
              description: '',
              telephone: '',
              address: '서울특별시 강남구 역삼동 826-20',
              roadAddress: '서울특별시 강남구 강남대로 362',
              mapx: '1270293248',
              mapy: '374951812',
            },
          ],
        }),
      ),
    );

    const result = await searchNaverLocalPlaces({
      naverClientId: 'client-id',
      naverClientSecret: 'client-secret',
      location: '강남역',
      category: 'cafe',
      limit: 3,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openapi.naver.com/v1/search/local.json?query=%EA%B0%95%EB%82%A8%EC%97%AD+%EC%B9%B4%ED%8E%98&display=3&start=1&sort=random',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Naver-Client-Id': 'client-id',
          'X-Naver-Client-Secret': 'client-secret',
        }),
      }),
    );
    expect(result).toEqual({
      provider: 'naverLocal',
      searchMode: 'keyword',
      query: '강남역 카페',
      category: 'cafe',
      location: '강남역',
      totalCount: 1,
      count: 1,
      places: [
        {
          name: '팀홀튼 강남역대륭타워점',
          category: '카페,디저트>카페',
          address: '서울특별시 강남구 역삼동 826-20',
          roadAddress: '서울특별시 강남구 강남대로 362',
          phone: '',
          link: 'https://example.com',
          longitude: 127.0293248,
          latitude: 37.4951812,
          raw: expect.any(Object),
        },
      ],
    });
  });

  it('네이버 키가 없으면 명확한 오류를 낸다', async () => {
    await expect(
      searchNaverLocalPlaces({
        naverClientId: '',
        naverClientSecret: '',
        location: '강남역',
        category: 'restaurant',
      }),
    ).rejects.toThrow('NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET');
  });

  it('검색어를 만들 수 없으면 명확한 오류를 낸다', async () => {
    await expect(
      searchNaverLocalPlaces({
        naverClientId: 'client-id',
        naverClientSecret: 'client-secret',
        category: 'all',
      }),
    ).rejects.toThrow('위치(location) 또는 검색어(keyword)');
  });

  it('네이버 오류 응답을 전달한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ errorMessage: 'quota exceeded' }), { status: 429 }),
      );

    await expect(
      searchNaverLocalPlaces({
        naverClientId: 'client-id',
        naverClientSecret: 'client-secret',
        keyword: '강남역 카페',
        fetchImpl,
      }),
    ).rejects.toThrow('quota exceeded');
  });

  it('비 JSON 오류 응답과 좌표 없는 성공 응답도 처리한다', async () => {
    const failedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('server unavailable', { status: 503 }));

    await expect(
      searchNaverLocalPlaces({
        naverClientId: 'client-id',
        naverClientSecret: 'client-secret',
        keyword: '강남역 카페',
        fetchImpl: failedFetch,
      }),
    ).rejects.toThrow('server unavailable');

    const emptyFailedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 500 }));

    await expect(
      searchNaverLocalPlaces({
        naverClientId: 'client-id',
        naverClientSecret: 'client-secret',
        keyword: '강남역 카페',
        fetchImpl: emptyFailedFetch,
      }),
    ).rejects.toThrow('HTTP 500');

    const successFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ title: '카페 &amp; 바', mapx: 'bad', mapy: '' }],
        }),
      ),
    );

    const result = await searchNaverLocalPlaces({
      naverClientId: 'client-id',
      naverClientSecret: 'client-secret',
      keyword: '카페',
      limit: 99,
      start: -5,
      sort: 'comment',
      fetchImpl: successFetch,
    });

    expect(successFetch).toHaveBeenCalledWith(
      'https://openapi.naver.com/v1/search/local.json?query=%EC%B9%B4%ED%8E%98&display=5&start=1&sort=comment',
      expect.any(Object),
    );
    expect(result.totalCount).toBe(1);
    expect(result.places[0]).toEqual(
      expect.objectContaining({
        name: '카페 & 바',
        longitude: null,
        latitude: null,
      }),
    );
  });

  it('인코딩된 태그 문자는 실행 가능한 HTML로 되살리지 않는다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              title: '&lt;script&gt;alert(1)&lt;/script&gt; <b>강남</b> &quot;카페&quot;',
              category: '카페 &amp; 디저트',
            },
          ],
        }),
      ),
    );

    const result = await searchNaverLocalPlaces({
      naverClientId: 'client-id',
      naverClientSecret: 'client-secret',
      keyword: '강남 카페',
      fetchImpl,
    });

    expect(result.places[0]).toEqual(
      expect.objectContaining({
        name: '&lt;script&gt;alert(1)&lt;/script&gt; 강남 "카페"',
        category: '카페 & 디저트',
      }),
    );
  });

  it('items가 없는 성공 응답은 빈 장소 목록으로 처리한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0 })));

    const result = await searchNaverLocalPlaces({
      naverClientId: 'client-id',
      naverClientSecret: 'client-secret',
      keyword: '없는 장소',
      fetchImpl,
    });

    expect(result.count).toBe(0);
    expect(result.places).toEqual([]);
  });
});
