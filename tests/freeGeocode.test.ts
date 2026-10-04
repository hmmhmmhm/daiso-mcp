import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeLocation } from '../src/utils/geocode.js';

describe('무료 위치 검색', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('주소는 Kakao 주소 검색으로 좌표를 검증한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [{ address_name: '부산 동구 중앙대로 206', x: '129.041', y: '35.115' }],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await geocodeLocation('부산 동구 중앙대로 206', { kakaoRestApiKey: 'test' }),
    ).toMatchObject({ latitude: 35.115, longitude: 129.041 });
    expect(fetchMock.mock.calls[0][0]).toContain('/search/address.json');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('KakaoAK test');
  });
  it('무관한 첫 장소 대신 이름이 일치하는 장소를 고른다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [
              { place_name: '서울역', address_name: '서울 중구', x: '126.9', y: '37.5' },
              { place_name: '부산역', address_name: '부산 동구', x: '129.041', y: '35.115' },
            ],
          }),
        ),
      ),
    );
    expect(await geocodeLocation('부산역', { kakaoRestApiKey: 'test' })).toMatchObject({
      latitude: 35.115,
    });
  });
  it('Google 키만 제공하면 요청하지 않는다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await geocodeLocation('부산역', { googleMapsApiKey: 'disabled' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
it('정식 시도명과 축약 주소를 같은 지역으로 해석한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [{ address_name: '부산 동구 중앙대로 206', x: '129.045', y: '35.117' }],
          }),
        ),
      ),
  );
  expect(
    await geocodeLocation('부산광역시 동구 중앙대로 206', { kakaoRestApiKey: 'free' }),
  ).toMatchObject({ latitude: 35.117 });
  vi.unstubAllGlobals();
});
it('역 이름과 주소 지역을 함께 검증한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [
              {
                place_name: '강남역 2호선',
                address_name: '서울 강남구',
                x: '127.027',
                y: '37.497',
              },
            ],
          }),
        ),
      ),
  );
  expect(await geocodeLocation('서울 강남역', { kakaoRestApiKey: 'free' })).toMatchObject({
    latitude: 37.497,
  });
  vi.unstubAllGlobals();
});
it.each([
  ['부산 동구 중앙대로 20', '부산 동구 중앙대로 206'],
  ['서울 강남역', '서울 강남역점'],
])('유사 문자열을 실제 위치로 오인하지 않는다: %s', async (query, name) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [{ place_name: name, address_name: name, x: '127', y: '37' }],
          }),
        ),
      ),
  );
  expect(await geocodeLocation(query, { kakaoRestApiKey: 'free' })).toBeNull();
  vi.unstubAllGlobals();
});
it('주소 검색은 Naver Local로 우회하지 않는다', async () => {
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  expect(
    await geocodeLocation('부산 동구 중앙대로 206', {
      naverClientId: 'id',
      naverClientSecret: 'secret',
    }),
  ).toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it('Kakao 오류는 이름이 일치하는 Naver 장소로 보완한다', async () => {
  const mockFetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            { title: '<b>부산역</b>', address: '부산 동구', mapx: '1290410000', mapy: '351150000' },
          ],
        }),
      ),
    );
  vi.stubGlobal('fetch', mockFetch);
  expect(
    await geocodeLocation('부산역', {
      kakaoRestApiKey: 'free',
      naverClientId: 'id',
      naverClientSecret: 'secret',
    }),
  ).toMatchObject({ latitude: 35.115 });
  vi.unstubAllGlobals();
});
it('네이버 장애도 다른 도시로 대체하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
  expect(
    await geocodeLocation('부산역', { naverClientId: 'id', naverClientSecret: 'secret' }),
  ).toBeNull();
  vi.unstubAllGlobals();
});
it.each([{}, [null]])(
  '잘못된 Kakao documents는 네이버 장소 검색으로 보완한다: %j',
  async (documents) => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ documents })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ title: '부산역', mapx: '1290410000', mapy: '351150000' }] }),
        ),
      );
    vi.stubGlobal('fetch', mockFetch);
    expect(
      await geocodeLocation('부산역', {
        kakaoRestApiKey: 'free',
        naverClientId: 'id',
        naverClientSecret: 'secret',
      }),
    ).toMatchObject({ latitude: 35.115 });
    vi.unstubAllGlobals();
  },
);
it('지번 주소의 본번과 부번을 보존한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [{ address_name: '서울 강남구 역삼동 123-4', x: '127', y: '37.5' }],
          }),
        ),
      ),
  );
  expect(
    await geocodeLocation('서울 강남구 역삼동 123-4', { kakaoRestApiKey: 'free' }),
  ).toMatchObject({ latitude: 37.5 });
  vi.unstubAllGlobals();
});
it.each([
 { address_name: 206, x: '129', y: '35' },
 { place_name: 123, x: '129', y: '35' },
])('문자열이 아닌 장소 필드는 건너뛰고 다음 유효한 결과를 해석한다', async (document) => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [document, { place_name: '부산역', address_name: '부산 동구', x: '129.041', y: '35.115' }] }))));
 expect(await geocodeLocation('부산역', { kakaoRestApiKey: 'free' })).toMatchObject({ latitude: 35.115 });
 vi.unstubAllGlobals();
});
it('주소 검색의 문자열이 아닌 주소 필드는 건너뛴다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ address_name: 206, x: '129', y: '35' }, { address_name: '부산 동구 중앙대로 206', x: '129.041', y: '35.115' }] }))));
 expect(await geocodeLocation('부산 동구 중앙대로 206', { kakaoRestApiKey: 'free' })).toMatchObject({ latitude: 35.115 });
 vi.unstubAllGlobals();
});
it('Worker에는 process가 없어도 환경 읽기가 안전하다', async () => {
 const { readGeocodeEnvironment } = await import('../src/utils/geocode.js');
 vi.stubGlobal('process', undefined);
 const result = readGeocodeEnvironment();
 vi.unstubAllGlobals();
 expect(result).toEqual({ kakaoRestApiKey: undefined, naverClientId: undefined, naverClientSecret: undefined });
});
it('장소 토큰이 없거나 네이버 결과가 무관하면 선택하지 않는다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ documents: [{ place_name: '부산역', y: '35', x: '129' }] })))));
 expect(await geocodeLocation('!!!', { kakaoRestApiKey: 'free' })).toBeNull();
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ title: '서울역', mapx: '1260000000', mapy: '370000000' }] }))));
 expect(await geocodeLocation('부산역', { naverClientId: 'id', naverClientSecret: 'secret' })).toBeNull();
 vi.unstubAllGlobals();
});
it('주소 응답이 누락되었거나 지번과 도로명 번호가 섞이면 선택하지 않는다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ documents: {} }))).mockResolvedValueOnce(new Response(JSON.stringify({ documents: [{ address_name: '서울 강남구 역삼동 123', road_address_name: '서울 강남구 테헤란로 4', y: '37.5', x: '127' }] }))));
 expect(await geocodeLocation('서울 강남구 역삼동 123', { kakaoRestApiKey: 'free' })).toBeNull();
 expect(await geocodeLocation('서울 강남구 역삼동 4', { kakaoRestApiKey: 'free' })).toBeNull();
 vi.unstubAllGlobals();
});
it('장소명 응답에 이름이 없으면 주소에 역명이 있어도 선택하지 않는다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ address_name: '부산역', x: '129', y: '35' }] }))));
 expect(await geocodeLocation('부산역', { kakaoRestApiKey: 'free' })).toBeNull();
 vi.unstubAllGlobals();
});
it('지번 주소가 없는 응답도 도로명 주소가 일치하면 해석한다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ road_address_name: '부산 동구 중앙대로 206', x: '129', y: '35' }] }))));
 expect(await geocodeLocation('부산 동구 중앙대로 206', { kakaoRestApiKey: 'free' })).toMatchObject({ formattedAddress: '부산 동구 중앙대로 206' });
 vi.unstubAllGlobals();
});
