import { afterEach, expect, it, vi } from 'vitest';
import { refreshRouteChecks } from '../../src/utils/routeProbes.js';
import { ROUTE_KEYS } from '../../src/utils/routeHealth.js';
vi.mock('../../src/utils/directRoutes.js', () => ({
  checkDirectRoute: vi.fn(async (key) => ({ key, direct: key !== 'gs25-stock', checkedAt: 100 })),
  boundedRouteJson: vi.fn(async () => ({ status: 'ok' })),
}));
import { checkDirectRoute, boundedRouteJson } from '../../src/utils/directRoutes.js';
const fetcher = vi.fn(async () => Response.json({}));
const namespace = {
  idFromName: vi.fn(() => ({})),
  get: vi.fn(() => ({ fetch: fetcher })),
} as unknown as DurableObjectNamespace;
afterEach(() => vi.clearAllMocks());
it('skips scheduling work when namespace is absent', async () => {
  await refreshRouteChecks({});
  expect(checkDirectRoute).not.toHaveBeenCalled();
});
it('writes all twenty-four checks and authenticated health probes with fixed paths', async () => {
  await refreshRouteChecks({
    UPSTREAM_ROUTE_HEALTH: namespace,
    OY_RELAY_URL: 'https://oy.example',
    OY_RELAY_TOKEN: 'oy',
    CONVENIENCE_RELAY_URL: 'https://cv.example',
    CONVENIENCE_RELAY_TOKEN: 'cv',
    CONVENIENCE_ACCESS_CLIENT_ID: 'id',
    CONVENIENCE_ACCESS_CLIENT_SECRET: 'secret',
    DTRYX_RELAY_URL: 'https://dt.example',
    DTRYX_RELAY_TOKEN: 'dt',
  });
  expect(checkDirectRoute).toHaveBeenCalledTimes(24);
  expect(vi.mocked(boundedRouteJson).mock.calls.map(([url]) => String(url))).toEqual([
    'https://dt.example/v1/cgv/health',
    'https://oy.example/health',
    'https://cv.example/v1/convenience/health',
    'https://dt.example/v1/dtryx/health',
  ]);
  expect(vi.mocked(boundedRouteJson).mock.calls[2][1].headers).toMatchObject({
    Authorization: 'Bearer cv',
    'CF-Access-Client-Id': 'id',
    'CF-Access-Client-Secret': 'secret',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(payload.checks.map((c: { key: string }) => c.key)).toEqual(ROUTE_KEYS);
  expect(payload.relays).toHaveLength(4);
});
it('writes partial failures independently without exposing exception details', async () => {
  vi.mocked(checkDirectRoute).mockRejectedValueOnce(new Error('private'));
  await refreshRouteChecks({ UPSTREAM_ROUTE_HEALTH: namespace });
  const payload = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(payload.checks[0]).toMatchObject({ direct: false, reason: 'network-error' });
  expect(payload.relays.every((r: { reason: string }) => r.reason === 'configuration')).toBe(true);
});

it('marks ready Olive Young healthy even with an exhausted quota', async () => {
  vi.mocked(boundedRouteJson).mockResolvedValueOnce({ state: 'ready', quota: { remaining: 0 } });
  await refreshRouteChecks({
    UPSTREAM_ROUTE_HEALTH: namespace,
    OY_RELAY_URL: 'http://localhost:3000/',
    OY_RELAY_TOKEN: 'token',
  });
  const payload = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(
    payload.relays.find((relay: { group: string }) => relay.group === 'oliveyoung'),
  ).toMatchObject({ healthy: true });
});
it('rejects incomplete Access credentials, unsafe URL and invalid health bodies', async () => {
  for (const url of [
    'oops',
    'http://evil.example',
    'https://user:pw@relay.example',
    'https://relay.example?x=1',
    'https://relay.example#x',
  ]) {
    await refreshRouteChecks({
      UPSTREAM_ROUTE_HEALTH: namespace,
      OY_RELAY_URL: url,
      OY_RELAY_TOKEN: 'token',
    });
  }
  await refreshRouteChecks({
    UPSTREAM_ROUTE_HEALTH: namespace,
    OY_RELAY_URL: 'https://relay.example',
    OY_RELAY_TOKEN: 'token',
    OY_ACCESS_CLIENT_ID: 'id',
  });
  for (const result of [null, [], 3, { state: 'warming' }]) {
    vi.mocked(boundedRouteJson).mockResolvedValueOnce(result);
    await refreshRouteChecks({
      UPSTREAM_ROUTE_HEALTH: namespace,
      OY_RELAY_URL: 'https://relay.example/',
      OY_RELAY_TOKEN: 'token',
    });
  }
  vi.mocked(boundedRouteJson).mockRejectedValueOnce(new Error('private'));
  await refreshRouteChecks({
    UPSTREAM_ROUTE_HEALTH: namespace,
    DTRYX_RELAY_URL: 'https://relay.example',
    DTRYX_RELAY_TOKEN: 'token',
  });
  const payload = JSON.parse(
    (fetcher.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string,
  );
  expect(payload.relays.find((relay: { group: string }) => relay.group === 'cgv')).toMatchObject({
    healthy: false,
    reason: 'network-error',
  });
});

it('limits outstanding probes to four and retains all independently completed checks', async () => {
  let active = 0;
  let peak = 0;
  vi.mocked(checkDirectRoute).mockImplementation(async (key) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return { key, direct: key !== 'gs25-stock', checkedAt: 100 };
  });
  await refreshRouteChecks({ UPSTREAM_ROUTE_HEALTH: namespace });
  expect(peak).toBe(4);
  expect(active).toBe(0);
});
