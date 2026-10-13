import { afterEach, expect, it, vi } from 'vitest';
import { createGeocodeFetch, withGeocodeProtection } from '../../src/utils/geocodeFetch.js';
const url =
  'https://dapi.kakao.com/v2/local/search/address.json?query=서울%20강남구%20테헤란로%201';
const init = { headers: { Authorization: 'KakaoAK test' } };
afterEach(() => vi.restoreAllMocks());
it('같은 주소의 진행 요청은 한 번만 호출하고 완료 후에는 다시 호출한다', async () => {
  let finish!: (r: Response) => void;
  const upstream = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          finish = r;
        }),
    )
    .mockImplementation(async () => Response.json({ documents: [] }));
  const run = createGeocodeFetch(upstream);
  const a = run(url, init);
  const b = run(url, init);
  await vi.waitFor(() => expect(upstream).toHaveBeenCalled());
  finish(Response.json({ documents: [] }));
  expect((await a).status).toBe(200);
  expect((await b).status).toBe(200);
  expect(upstream).toHaveBeenCalledTimes(1);
  await run(url, init);
  expect(upstream).toHaveBeenCalledTimes(2);
});
it('quota -10 뒤 다른 주소도 호출하지 않지만 keyword는 별도로 조회한다', async () => {
  const upstream = vi
    .fn()
    .mockImplementation(async () => Response.json({ code: -10 }, { status: 400 }));
  const run = createGeocodeFetch(upstream);
  expect((await run(url, init)).status).toBe(400);
  expect((await run(url.replace('테헤란로', '도산대로'), init)).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
  await run('https://dapi.kakao.com/v2/local/search/keyword.json?query=강남역&size=15', init);
  expect(upstream).toHaveBeenCalledTimes(2);
});
it('configured DO 장애 때 원본 직접 호출로 우회하지 않는다', async () => {
  const upstream = vi.fn();
  const stub = { fetch: vi.fn().mockRejectedValue(new Error('private')) };
  const ns = { idFromName: vi.fn(), get: () => stub } as unknown as DurableObjectNamespace;
  await expect(
    withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
      createGeocodeFetch(upstream)(url, init),
    ),
  ).rejects.toThrow();
  expect(upstream).not.toHaveBeenCalled();
});
it('caller 취소는 다른 병합 caller를 끊지 않는다', async () => {
  let finish!: (r: Response) => void;
  const upstream = vi.fn(
    () =>
      new Promise<Response>((r) => {
        finish = r;
      }),
  );
  const run = createGeocodeFetch(upstream);
  const controller = new AbortController();
  const a = run(url, { ...init, signal: controller.signal });
  const b = run(url, init);
  const failed = expect(a).rejects.toThrow();
  await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1));
  controller.abort();
  await failed;
  finish(Response.json({ documents: [] }));
  expect((await b).status).toBe(200);
});
it('내부 바인딩에는 자격증명 원문 대신 해시만 전달한다', async () => {
  const rpc = vi.fn<typeof fetch>(async () =>
    Response.json({ status: 200, body: { documents: [] } }),
  );
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: rpc }),
  } as unknown as DurableObjectNamespace;
  const source = vi.fn();
  const response = await withGeocodeProtection(
    { GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' },
    () => createGeocodeFetch(source)(url, init),
  );
  expect(response.status).toBe(200);
  expect(source).not.toHaveBeenCalled();
  const body = JSON.parse(String(rpc.mock.calls[0][1]?.body));
  expect(body.scope).toMatch(/^[a-f0-9]{64}$/);
  expect(body.provider).toBe('kakao-address');
  expect(body.params.query).toContain('테헤란로');
  expect(Object.keys(body)).toEqual(['provider', 'params', 'scope', 'timeoutMs']);
});
it('네이버 지역 검색에도 동일한 공유 보호를 적용한다', async () => {
  const rpc = vi.fn<typeof fetch>(async () => Response.json({ status: 200, body: { items: [] } }));
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: rpc }),
  } as unknown as DurableObjectNamespace;
  const source = vi.fn();
  await withGeocodeProtection(
    { GEOCODE_GATEWAY: ns, NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret' },
    () =>
      createGeocodeFetch(source)(
        'https://openapi.naver.com/v1/search/local.json?query=부산역&display=5&start=1&sort=random',
        { headers: { 'X-Naver-Client-Id': 'id', 'X-Naver-Client-Secret': 'secret' } },
      ),
  );
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(source).not.toHaveBeenCalled();
});
it('다른 자격증명은 서버 바인딩의 quota나 key와 섞지 않는다', async () => {
  const rpc = vi.fn();
  const source = vi.fn<typeof fetch>(async () => Response.json({ documents: [] }));
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: rpc }),
  } as unknown as DurableObjectNamespace;
  await withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'other' }, () =>
    createGeocodeFetch(source)(url, init),
  );
  expect(source).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalled();
});
it('다른 API 주소는 공급자 게이트나 요청 내용을 변경하지 않는다', async () => {
  const response = new Response('plain');
  const source = vi.fn(async () => response);
  expect(await createGeocodeFetch(source)('https://example.com/data')).toBe(response);
});
it.each([
  ['credentials', url, {}],
  ['credential-prefix', url, { headers: { Authorization: 'Bearer test' } }],
  ['method', url, { ...init, method: 'POST' }],
  ['query', url + '&invalid=yes', init],
  ['userinfo', url.replace('https://', 'https://private@'), init],
])('잘못된 공급자 요청은 외부로 보내지 않는다: %s', async (_, target, options) => {
  const source = vi.fn();
  await expect(createGeocodeFetch(source)(target, options)).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
});
it.each([
  null,
  {},
  { status: 600, body: {} },
  { status: 200.5, body: {} },
  { status: 199, body: {} },
  { status: 200 },
])('잘못된 내부 packet은 사용하지 않는다: %j', async (packet) => {
  const rpc = vi.fn<typeof fetch>(async () => Response.json(packet));
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: rpc }),
  } as unknown as DurableObjectNamespace;
  await expect(
    withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
      createGeocodeFetch(vi.fn())(url, init),
    ),
  ).rejects.toThrow('GEOCODE_INVALID_RESPONSE');
});
it('내부 503이 원본의 성공 응답처럼 해석되지 않는다', async () => {
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: async () => new Response(null, { status: 503 }) }),
  } as unknown as DurableObjectNamespace;
  await expect(
    withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
      createGeocodeFetch(vi.fn())(url, init),
    ),
  ).rejects.toThrow('GEOCODE_GATEWAY_UNAVAILABLE');
});
it.each([204, 205, 304])('본문 없는 공급자 상태는 본문을 만들지 않는다: %i', async (status) => {
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: async () => Response.json({ status, body: null }) }),
  } as unknown as DurableObjectNamespace;
  const r = await withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
    createGeocodeFetch(vi.fn())(url, init),
  );
  expect(r.status).toBe(status);
  expect(await r.text()).toBe('');
});
it('이미 취소된 caller는 query 해시나 원본 작업을 시작하지 않는다', async () => {
  const source = vi.fn();
  const c = new AbortController();
  c.abort();
  await expect(createGeocodeFetch(source)(url, { ...init, signal: c.signal })).rejects.toThrow(
    'GEOCODE_CANCELLED',
  );
  expect(source).not.toHaveBeenCalled();
});
it('자격증명 해시 중 취소된 caller도 새 작업을 만들지 않는다', async () => {
  const source = vi.fn();
  const c = new AbortController();
  const result = createGeocodeFetch(source)(url, { ...init, signal: c.signal });
  c.abort();
  await expect(result).rejects.toThrow('GEOCODE_CANCELLED');
  expect(source).not.toHaveBeenCalled();
});
it('Request 객체의 GET·header·signal도 유지한다', async () => {
  const source = vi.fn<typeof fetch>(async () => Response.json({ documents: [] }));
  const r = await withGeocodeProtection(undefined, () =>
    createGeocodeFetch(source)(new Request(url, init)),
  );
  expect(r.status).toBe(200);
  expect(source).toHaveBeenCalledTimes(1);
});
it('무바인딩 내부 호출은 부모 요청 context를 상속하지 않는다', async () => {
  const rpc = vi.fn();
  const source = vi.fn<typeof fetch>(async () => Response.json({ documents: [] }));
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: rpc }),
  } as unknown as DurableObjectNamespace;
  await withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
    withGeocodeProtection({}, () => createGeocodeFetch(source)(url, init)),
  );
  expect(source).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalled();
});
it.each([NaN, 0, 25000])(
  '시간 예산은 공유 요청에도 유한한 범위로 제한한다: %s',
  async (timeout) => {
    const rpc = vi.fn<typeof fetch>(async () => Response.json({ status: 200, body: {} }));
    const ns = {
      idFromName: vi.fn(),
      get: () => ({ fetch: rpc }),
    } as unknown as DurableObjectNamespace;
    await withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
      createGeocodeFetch(vi.fn(), timeout)(url, init),
    );
    expect(JSON.parse(String(rpc.mock.calls[0][1]?.body)).timeoutMs).toBe(
      Number.isNaN(timeout) ? 10000 : Math.max(1, Math.min(20000, timeout)),
    );
  },
);
it('반환하지 않는 내부 RPC는 기한 뒤 실패한다', async () => {
  const ns = {
    idFromName: vi.fn(),
    get: () => ({ fetch: () => new Promise(() => {}) }),
  } as unknown as DurableObjectNamespace;
  await expect(
    withGeocodeProtection({ GEOCODE_GATEWAY: ns, KAKAO_REST_API_KEY: 'test' }, () =>
      createGeocodeFetch(vi.fn(), 5)(url, init),
    ),
  ).rejects.toThrow('GEOCODE_TIMEOUT');
});
