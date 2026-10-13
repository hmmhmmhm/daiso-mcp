import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  geocodeLocation,
  searchKakaoPlaces,
  geocodeBindings,
  readGeocodeEnvironment,
  validKoreanCoordinates,
} from '../../src/utils/geocode.js';

const address = '서울 강남구 예시로5길 30';
const keys = {
  kakaoRestApiKey: 'test-kakao',
  naverClientId: 'test-id',
  naverClientSecret: 'test-secret',
};
const kakao = (value: string = address) => ({
  place_name: '예시가게',
  address_name: value,
  x: '127',
  y: '37.5',
});
const naver = (value: string = address) => ({
  title: '예시가게',
  roadAddress: value,
  mapx: '1270000000',
  mapy: '375000000',
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function responses(...values: Response[]) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async () => (values.shift() ?? json({ documents: [], items: [] })).clone());
}

describe('정확한 주소 fallback', () => {
  beforeEach(() => {
    vi.stubEnv('KAKAO_REST_API_KEY', '');
    vi.stubEnv('NAVER_CLIENT_ID', '');
    vi.stubEnv('NAVER_CLIENT_SECRET', '');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('주소 API 쿼터 소진 후 정확한 Kakao keyword 주소를 사용한다', async () => {
    const fetchImpl = responses(json({ code: -10 }, 400), json({ documents: [kakao()] }));
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toEqual({
      latitude: 37.5,
      longitude: 127,
      formattedAddress: address,
    });
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/v2/local/search/address.json',
      '/v2/local/search/keyword.json',
    ]);
  });

  it('keyword의 다른 주소를 버리고 Naver의 정확한 주소로 보완한다', async () => {
    const fetchImpl = responses(
      json({ documents: [] }),
      json({ documents: [kakao('서울 강남구 예시로5길 31')] }),
      json({ items: [naver()] }),
    );
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toMatchObject({
      formattedAddress: address,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('Kakao 키가 없어도 Naver의 정확한 주소를 사용한다', async () => {
    const fetchImpl = responses(json({ items: [naver()] }));
    expect(
      await geocodeLocation(address, {
        naverClientId: 'test-id',
        naverClientSecret: 'test-secret',
        fetchImpl,
      }),
    ).toMatchObject({ latitude: 37.5 });
  });

  it.each(['서울 강남구 예시로30길 5', '부산 강남구 예시로5길 30', '서울 동강남구 예시로5길 30'])(
    'fallback은 순서나 지역이 다른 주소를 거절한다: %s',
    async (other) => {
      const fetchImpl = responses(
        json({ documents: [] }),
        json({ documents: [kakao(other)] }),
        json({ items: [naver(other)] }),
      );
      expect(await geocodeLocation(address, { ...keys, fetchImpl })).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );

  it('장소명만 입력주소와 같아도 다른 주소를 선택하지 않는다', async () => {
    const other = '서울 강남구 예시로5길 31';
    const fetchImpl = responses(
      json({ documents: [] }),
      json({ documents: [{ ...kakao(other), place_name: address }] }),
      json({ items: [{ ...naver(other), title: address }] }),
    );
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toBeNull();
  });

  it('모든 fallback에서 한국 밖의 좌표를 거절한다', async () => {
    const fetchImpl = responses(
      json({ documents: [] }),
      json({ documents: [{ ...kakao(), x: '140' }] }),
      json({ items: [{ ...naver(), mapy: '420000000' }] }),
    );
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toBeNull();
  });

  it('정식 전북 명칭과 축약 지역명을 일치시킨다', async () => {
    const fetchImpl = responses(
      json({ documents: [] }),
      json({ documents: [kakao('전북 예시시 예시로 30')] }),
    );
    expect(
      await geocodeLocation('전북특별자치도 예시시 예시로 30', { ...keys, fetchImpl }),
    ).toMatchObject({ latitude: 37.5 });
  });

  it('모든 키가 없으면 주소 요청을 하지 않는다', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await geocodeLocation(address, { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([null, {}, [null, 7, { address_name: 30 }]])(
    '잘못된 documents 뒤에도 정확한 fallback을 찾는다: %j',
    async (documents) => {
      const fetchImpl = responses(json({ documents }), json({ documents: [kakao()] }));
      expect(await geocodeLocation(address, { ...keys, fetchImpl })).toMatchObject({
        latitude: 37.5,
      });
    },
  );

  it('주소 응답의 잘못된 JSON 이후에도 정확한 fallback을 찾는다', async () => {
    const fetchImpl = responses(new Response('invalid json'), json({ documents: [kakao()] }));
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toMatchObject({
      latitude: 37.5,
    });
  });

  it('주소 요청 timeout 뒤에도 정확한 fallback을 찾는다', async () => {
    const fetchImpl = responses(json({ documents: [kakao()] }));
    fetchImpl.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    expect(await geocodeLocation(address, { ...keys, fetchImpl, timeoutMs: 20 })).toMatchObject({
      latitude: 37.5,
    });
  });

  it('기존 장소 검색은 Kakao keyword에서 Naver 이름 검색으로 보완한다', async () => {
    const fetchImpl = responses(
      json({ documents: [] }),
      json({ items: [{ ...naver(), title: '예시역' }] }),
    );
    expect(await geocodeLocation('예시역', { ...keys, fetchImpl })).toMatchObject({
      latitude: 37.5,
    });
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/v2/local/search/keyword.json',
      '/v1/search/local.json',
    ]);
  });
  it('빈 입력과 환경키 없는 입력은 요청하지 않는다', async () => {
    expect(await geocodeLocation(' ')).toBeNull();
    expect(await geocodeLocation('예시역')).toBeNull();
    expect(geocodeBindings()).toEqual({
      kakaoRestApiKey: undefined,
      naverClientId: undefined,
      naverClientSecret: undefined,
    });
    expect(
      geocodeBindings({
        KAKAO_REST_API_KEY: 'test-kakao',
        NAVER_CLIENT_ID: 'test-id',
        NAVER_CLIENT_SECRET: 'test-secret',
      }),
    ).toEqual(keys);
  });

  it.each([
    [NaN, 127],
    [37, NaN],
    [32, 127],
    [40, 127],
    [37, 123],
    [37, 133],
    [33, 124],
    [39, 132],
  ])('한국 좌표 경계를 검증한다: %s %s', (latitude, longitude) => {
    expect(validKoreanCoordinates(latitude, longitude)).toBe(
      latitude >= 33 && latitude <= 39 && longitude >= 124 && longitude <= 132,
    );
  });

  it('근처 Kakao 장소검색은 거리순 파라미터와 지정 timeout을 유지한다', async () => {
    const fetchImpl = responses(json({ documents: [null, { place_name: 3 }, kakao()] }));
    expect(
      await searchKakaoPlaces(
        '예시역',
        { ...keys, fetchImpl, timeout: 20 },
        { latitude: 37.5, longitude: 127 },
      ),
    ).toEqual([kakao()]);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      x: '127',
      y: '37.5',
      radius: '20000',
      sort: 'distance',
    });
  });

  it('Kakao 장소검색의 누락된 documents와 키는 빈 배열로 처리한다', async () => {
    const fetchImpl = responses(json({}));
    expect(await searchKakaoPlaces('예시역', { ...keys, fetchImpl, timeoutMs: 20 })).toEqual([]);
    expect(await searchKakaoPlaces('예시역', {})).toEqual([]);
  });

  it('keyword 장애 후에도 Naver의 지번주소 일치로 보완한다', async () => {
    const fetchImpl = responses(
      json({ documents: [] }),
      new Response('invalid json'),
      json({ items: [{ ...naver(), roadAddress: '', address }] }),
    );
    expect(await geocodeLocation(address, { ...keys, fetchImpl, timeout: 20 })).toMatchObject({
      formattedAddress: address,
    });
  });

  it.each([null, {}, [null], [{ title: '예시가게', address: 3 }]])(
    'Naver의 malformed items는 위치로 사용하지 않는다: %j',
    async (items) => {
      const fetchImpl = responses(json({ items }));
      expect(
        await geocodeLocation(address, {
          naverClientId: 'test-id',
          naverClientSecret: 'test-secret',
          fetchImpl,
        }),
      ).toBeNull();
    },
  );

  it.each([{ mapx: undefined }, { mapy: undefined }, { mapx: 'not a coordinate' }])(
    'Naver의 누락되거나 잘못된 좌표를 거절한다: %j',
    async (invalid) => {
      const fetchImpl = responses(json({ items: [{ ...naver(), ...invalid }] }));
      expect(
        await geocodeLocation(address, {
          naverClientId: 'test-id',
          naverClientSecret: 'test-secret',
          fetchImpl,
        }),
      ).toBeNull();
    },
  );

  it('정확한 첫 주소를 찾으면 대체 공급자를 호출하지 않는다', async () => {
    const fetchImpl = responses(json({ documents: [kakao()] }));
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toMatchObject({
      latitude: 37.5,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('Worker에서 process가 없어도 환경 읽기를 처리한다', () => {
    vi.stubGlobal('process', undefined);
    const options = readGeocodeEnvironment();
    vi.unstubAllGlobals();
    expect(options).toEqual({
      kakaoRestApiKey: undefined,
      naverClientId: undefined,
      naverClientSecret: undefined,
    });
  });

  it.each([
    [
      '예시가게',
      { ...kakao(), address_name: undefined, road_address_name: undefined },
      { formattedAddress: null },
    ],
    ['예시가게 30', { ...kakao(), place_name: '예시가게 30' }, { latitude: 37.5 }],
    ['예시가게 30', { ...kakao(), place_name: '예시가게', address_name: undefined }, null],
    [
      '예시가게',
      { ...kakao(), place_name: '다른가게', road_address_name: '예시가게' },
      { latitude: 37.5 },
    ],
    ['!!!', kakao(), null],
    ['예시역', { ...kakao(), place_name: '예시역점' }, null],
    ['예시역', { ...kakao(), place_name: undefined }, null],
  ])('Kakao 장소의 이름·주소·숫자 매칭을 유지한다: %s', async (query, document, expected) => {
    const fetchImpl = responses(json({ documents: [document] }));
    const result = await geocodeLocation(query, { kakaoRestApiKey: 'test-kakao', fetchImpl });
    if (expected === null) expect(result).toBeNull();
    else expect(result).toMatchObject(expected);
  });

  it('Kakao 도로명주소만 있어도 정확한 입력주소를 일치시킨다', async () => {
    const fetchImpl = responses(
      json({ documents: [{ ...kakao(), address_name: undefined, road_address_name: address }] }),
    );
    expect(await geocodeLocation(address, { ...keys, fetchImpl })).toMatchObject({
      formattedAddress: address,
    });
  });

  it('Naver 장소의 주소가 없으면 formattedAddress는 null이다', async () => {
    const fetchImpl = responses(
      json({ items: [{ ...naver(), title: '예시역', roadAddress: '' }] }),
    );
    expect(
      await geocodeLocation('예시역', {
        naverClientId: 'test-id',
        naverClientSecret: 'test-secret',
        fetchImpl,
      }),
    ).toEqual({ latitude: 37.5, longitude: 127, formattedAddress: null });
  });
  it('주소 단계가 전체 기한을 소비하면 keyword와 Naver를 호출하지 않는다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      vi.setSystemTime(1100);
      return json({ documents: [] });
    });
    expect(await geocodeLocation(address, { ...keys, fetchImpl, timeoutMs: 100 })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keyword 단계 뒤 전체 기한이 소진되면 Naver를 호출하지 않는다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      vi.setSystemTime(fetchImpl.mock.calls.length === 1 ? 1040 : 1100);
      return json({ documents: [] });
    });
    expect(await geocodeLocation(address, { ...keys, fetchImpl, timeout: 100 })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('앞 단계 지연을 빼고 남은 시간만 keyword에 적용한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let started!: () => void;
    const keywordStarted = new Promise<void>((resolve) => { started = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      if (fetchImpl.mock.calls.length === 1) {
        vi.setSystemTime(1040);
        return json({ documents: [] });
      }
      started();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    const task = geocodeLocation(address, { ...keys, fetchImpl, timeoutMs: 100 });
    await keywordStarted;
    await vi.advanceTimersByTimeAsync(60);
    let done = false;
    void task.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(await task).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('장소명 검색도 Kakao 지연 뒤 Naver에서 전체 남은 시간만 사용한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let started!: () => void;
    const naverStarted = new Promise<void>((resolve) => { started = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      if (fetchImpl.mock.calls.length === 1) {
        vi.setSystemTime(1070);
        return json({ documents: [] });
      }
      started();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    const task = geocodeLocation('예시역', { ...keys, fetchImpl, timeoutMs: 100 });
    await naverStarted;
    await vi.advanceTimersByTimeAsync(30);
    let done = false;
    void task.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(await task).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('독립적인 Kakao 장소검색은 명시 timeout 없이도 기본 예산으로 동작한다', async () => {
    const fetchImpl = responses(json({ documents: [kakao()] }));
    expect(await searchKakaoPlaces('예시가게', { ...keys, fetchImpl })).toEqual([kakao()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('이미 소진된 전체 예산으로는 공급자를 호출하지 않는다', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await geocodeLocation(address, { ...keys, fetchImpl, timeoutMs: 0 })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

});
