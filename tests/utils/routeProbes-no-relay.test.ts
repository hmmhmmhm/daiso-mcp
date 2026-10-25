/** 정기 경로 검사는 중계 원본 조회 예산을 사용하지 않습니다. */
import { afterEach, expect, it, vi } from 'vitest';
import { refreshRouteChecks } from '../../src/utils/routeProbes.js';
afterEach(() => vi.unstubAllGlobals());
it('실제 검사 함수는 직접 원본 요청과 중계 건강 GET만 호출한다', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: 'ok', state: 'ready' }));
  vi.stubGlobal('fetch', fetcher);
  const storageFetch = vi.fn(async () => Response.json({}));
  const namespace = {
    idFromName: () => ({}),
    get: () => ({ fetch: storageFetch }),
  } as unknown as DurableObjectNamespace;
  await refreshRouteChecks({
    UPSTREAM_ROUTE_HEALTH: namespace,
    DTRYX_RELAY_URL: 'https://relay.example',
    DTRYX_RELAY_TOKEN: 'test',
    CONVENIENCE_RELAY_URL: 'https://relay.example',
    CONVENIENCE_RELAY_TOKEN: 'test',
    OY_RELAY_URL: 'https://relay.example',
    OY_RELAY_TOKEN: 'test',
  });
  const calls = fetcher.mock.calls as unknown as [URL, RequestInit][];
  const relayCalls = calls.filter(([url]) => url.hostname === 'relay.example');
  expect(relayCalls).toHaveLength(4);
  expect(
    relayCalls.every(([url, init]) => url.pathname.endsWith('/health') && init.method === 'GET'),
  ).toBe(true);
  const cgvCalls = calls.filter(([url]) => url.hostname === 'api.cgv.co.kr');
  expect(cgvCalls).toHaveLength(3);
  const bookingCalls = calls.filter(([url]) => url.origin === 'https://cgv.co.kr');
  expect(bookingCalls).toHaveLength(1);
  expect(bookingCalls[0][0].pathname).toBe('/api/v1/booking/searchMovScnInfo');
  expect(bookingCalls[0][1].method).toBe('GET');
  expect(cgvCalls.every(([, init]) => init.method === 'GET')).toBe(true);
  expect(storageFetch).toHaveBeenCalledTimes(1);
});

it('bounds both scheduled health attempts when transport ignores cancellation', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (url: URL) => {
    if (url.hostname === 'relay.example') return new Promise<Response>(() => {});
    return Response.json({ status: 'ok', state: 'ready' });
  });
  vi.stubGlobal('fetch', fetcher);
  const storageFetch = vi.fn(async () => Response.json({}));
  const namespace = {
    idFromName: () => ({}),
    get: () => ({ fetch: storageFetch }),
  } as unknown as DurableObjectNamespace;
  try {
    const refreshed = refreshRouteChecks({
      UPSTREAM_ROUTE_HEALTH: namespace,
      OY_RELAY_URL: 'https://relay.example',
      OY_RELAY_TOKEN: 'test',
    });
    await vi.waitFor(() => {
      expect(fetcher.mock.calls.some(([url]) => url.hostname === 'relay.example')).toBe(true);
    });
    await vi.advanceTimersByTimeAsync(6000);
    await refreshed;
    const relayCalls = (fetcher.mock.calls as unknown as [URL, RequestInit][]).filter(
      ([url]) => url.hostname === 'relay.example',
    );
    expect(relayCalls).toHaveLength(2);
    expect(
      relayCalls.every(([url, init]) => url.pathname === '/health' && init.method === 'GET'),
    ).toBe(true);
    expect(relayCalls.every(([, init]) => init.signal?.aborted)).toBe(true);
    const init = (storageFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    const payload = JSON.parse(init.body as string);
    expect(
      payload.relays.find((row: { group: string }) => row.group === 'oliveyoung'),
    ).toMatchObject({
      healthy: false,
      reason: 'timeout',
    });
  } finally {
    vi.useRealTimers();
  }
});
