/** CGV 무료 중계의 인증·실패 계약을 검증합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import { ROUTE_KEYS } from '../../../src/utils/routeHealth.js';
import { cgvTransportFromBindings } from '../../../src/services/cgv/relayTransport.js';
import { requestCgv } from '../../../src/services/cgv/transport.js';
const options = {
  cgvRelayUrl: 'https://relay.example',
  cgvRelayToken: 'test-token',
  cgvAccessClientId: 'test-id',
  cgvAccessClientSecret: 'test-secret',
};
const path = '/cnm/atkt/searchRegnList';
const params = new URLSearchParams({ coCd: 'A420' });
afterEach(() => {
  vi.unstubAllGlobals();
});
it('직접 경로가 검증되지 않았으면 인증된 무료 중계를 호출한다', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ statusCode: 0, data: [] }));
  vi.stubGlobal('fetch', fetcher);
  await expect(requestCgv(path, params, 1000, undefined, options)).resolves.toEqual({
    statusCode: 0,
    data: [],
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://relay.example/v1/cgv/theaters');
  expect(init).toMatchObject({ method: 'POST', redirect: 'manual', body: '{}' });
  expect(init.headers).toMatchObject({
    Authorization: 'Bearer test-token',
    'CF-Access-Client-Id': 'test-id',
    'CF-Access-Client-Secret': 'test-secret',
  });
});
it.each(['http://remote.example', 'https://user:pass@relay.example', 'https://relay.example?x=1'])(
  '불안전한 중계 URL을 거부한다: %s',
  async (cgvRelayUrl) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('blocked', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      requestCgv(path, params, 1000, undefined, { ...options, cgvRelayUrl }),
    ).rejects.toMatchObject({ code: 'CGV_RELAY_CONFIG_ERROR' });
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it.each([302, 403, 429, 502, 504])(
  '중계 HTTP %i 오류를 빈 성공으로 바꾸지 않는다',
  async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('private', { status })));
    await expect(requestCgv(path, params, 1000, undefined, options)).rejects.toMatchObject({
      code: 'CGV_RELAY_FAILED',
      upstreamStatus: status,
    });
  },
);
it.each([
  { statusCode: 1, data: [] },
  { statusCode: 0, data: null },
  { statusCode: 0, data: [null] },
])('실패 또는 잘못된 중계 응답을 거부한다: %j', async (data) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(data)));
  await expect(requestCgv(path, params, 1000, undefined, options)).rejects.toMatchObject({
    code: 'CGV_RELAY_FAILED',
  });
});

it('주기 직접 검사를 위한 CGV 고정 작업을 등록한다', () => {
  expect(ROUTE_KEYS).toEqual(
    expect.arrayContaining(['cgv-theaters', 'cgv-movies', 'cgv-timetable', 'cgv-timetable-movie']),
  );
});
it('DTRYX 자격증명 전체를 기본값으로 사용하고 CGV 일부 설정과 섞지 않는다', () => {
  const bindings = { DTRYX_RELAY_URL: 'https://relay.example', DTRYX_RELAY_TOKEN: 'dtryx-token' };
  expect(cgvTransportFromBindings(bindings)).toMatchObject({
    cgvRelayUrl: 'https://relay.example',
    cgvRelayToken: 'dtryx-token',
  });
  expect(cgvTransportFromBindings({ ...bindings, CGV_RELAY_TOKEN: 'cgv-token' })).toMatchObject({
    cgvRelayUrl: undefined,
    cgvRelayToken: 'cgv-token',
  });
});

it('중계 429의 검증된 할당량 원인과 대기 시간을 보존한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('', {
        status: 429,
        headers: { 'x-relay-quota-reason': 'minute', 'Retry-After': '30' },
      }),
    ),
  );
  await expect(requestCgv(path, params, 1000, undefined, options)).rejects.toMatchObject({
    quotaReason: 'minute',
    retryAfter: 30,
  });
});
it('중계를 호출하거나 본문을 읽는 동안 중단 신호를 무시해도 기한을 지킨다', async () => {
  vi.useFakeTimers();
  for (const response of [undefined, { status: 200, json: () => new Promise(() => {}) }]) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() => (response ? Promise.resolve(response) : new Promise(() => {}))),
    );
    const checked = expect(requestCgv(path, params, 100, undefined, options)).rejects.toMatchObject(
      { code: 'CGV_RELAY_TIMEOUT', status: 504 },
    );
    await vi.advanceTimersByTimeAsync(100);
    await checked;
  }
  vi.useRealTimers();
});

it('검증된 직접 경로도 잘못된 중계 설정을 가리지 않는다', async () => {
  const { withRouteRouting, routeOperation } = await import('../../../src/utils/routeHealth.js');
  const pending: Promise<unknown>[] = [];
  const snapshot = {
    routes: { 'cgv-theaters': { key: 'cgv-theaters', direct: true, checkedAt: Date.now() } },
    relays: {},
  };
  const ns = {
    idFromName: () => ({ toString: () => 'cgv-invalid-config' }),
    get: () => ({ fetch: async () => Response.json(snapshot) }),
  } as unknown as DurableObjectNamespace;
  await withRouteRouting(
    ns,
    (p) => pending.push(p),
    () =>
      routeOperation(
        'cgv-theaters',
        1000,
        async () => null,
        async () => null,
      ),
  );
  await Promise.all(pending);
  const fetcher = vi.fn().mockResolvedValue(Response.json({ statusCode: 0, data: [] }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    withRouteRouting(
      ns,
      (p) => pending.push(p),
      () => requestCgv(path, params, 1000, undefined, { ...options, cgvRelayToken: '' }),
    ),
  ).rejects.toMatchObject({ code: 'CGV_RELAY_CONFIG_ERROR' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  null,
  [],
  1,
  { statusCode: 0, data: [1] },
  { statusCode: 0, data: [[]] },
  { statusCode: 0, data: [{}] },
])('중계의 JSON 구조를 검증하고 올바른 행은 허용한다: %j', async (data) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
  const result = requestCgv(path, params, 1000, undefined, options);
  if (
    data &&
    !Array.isArray(data) &&
    typeof data === 'object' &&
    data.data?.[0] &&
    !Array.isArray(data.data[0]) &&
    typeof data.data[0] === 'object'
  )
    await expect(result).resolves.toEqual(data);
  else await expect(result).rejects.toMatchObject({ code: 'CGV_RELAY_FAILED' });
});
it('네트워크 실패 응답의 원문은 외부에 노출하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private details')));
  await expect(requestCgv(path, params, 1000, undefined, options)).rejects.toMatchObject({
    code: 'CGV_RELAY_FAILED',
    message: 'CGV 릴레이 요청에 실패했습니다.',
  });
});
it('실패 본문 취소 오류는 요청 오류를 바꾸지 않는다', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        status: 503,
        body: { cancel: () => Promise.reject(new Error('private')) },
        headers: new Headers(),
      }),
  );
  await expect(requestCgv(path, params, 1000, undefined, options)).rejects.toMatchObject({
    code: 'CGV_RELAY_FAILED',
    upstreamStatus: 503,
  });
});
