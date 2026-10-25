import { beforeEach, expect, it, vi } from 'vitest';
import { refreshRouteChecks } from '../../src/utils/routeProbes.js';
import { HttpError } from '../../src/utils/http.js';
import type { RelayCheck } from '../../src/utils/routeHealth.js';
vi.mock('../../src/utils/directRoutes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/directRoutes.js')>()),
  checkDirectRoute: vi.fn(async (key) => ({ key, direct: true, checkedAt: 100 })),
  boundedRouteJson: vi.fn(),
}));
import { boundedRouteJson, DirectRouteError } from '../../src/utils/directRoutes.js';
const health = vi.mocked(boundedRouteJson);
const storageFetch = vi.fn(async () => Response.json({}));
const namespace = {
  idFromName: () => ({}),
  get: () => ({ fetch: storageFetch }),
} as unknown as DurableObjectNamespace;
const env = {
  UPSTREAM_ROUTE_HEALTH: namespace,
  OY_RELAY_URL: 'https://relay.example',
  OY_RELAY_TOKEN: 'private-token',
};
function recordedRelay(): RelayCheck {
  const init = (storageFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
  return JSON.parse(init.body as string).relays.find(
    (row: RelayCheck) => row.group === 'oliveyoung',
  );
}
beforeEach(() => {
  health.mockReset();
  storageFetch.mockClear();
});
it.each([
  [new Error('private-url-and-token'), 'network-error'],
  [new DirectRouteError('network-error'), 'network-error'],
  [new DirectRouteError('timeout'), 'timeout'],
  [new HttpError(503, 'private-status', 'private-body'), 'http-503'],
])(
  'confirms a transient failure once and preserves its safe recovery reason: %s',
  async (error, reason) => {
    health.mockRejectedValueOnce(error).mockResolvedValueOnce({ state: 'ready' });
    await refreshRouteChecks(env);
    expect(recordedRelay()).toMatchObject({ healthy: true, reason: `recovered-${reason}` });
    expect(health).toHaveBeenCalledTimes(2);
    for (const [url, init, timeout] of health.mock.calls) {
      expect(String(url)).toBe('https://relay.example/health');
      expect(init.method).toBe('GET');
      expect(timeout).toBe(3000);
    }
  },
);
it.each([
  [new Error('private'), 'network-error'],
  [new DirectRouteError('timeout'), 'timeout'],
  [new HttpError(503, 'private', 'private'), 'http-503'],
])('records a persistent failure after exactly two attempts: %s', async (error, reason) => {
  health.mockRejectedValue(error);
  await refreshRouteChecks(env);
  expect(recordedRelay()).toMatchObject({ healthy: false, reason });
  expect(health).toHaveBeenCalledTimes(2);
});
it('records the final confirmation failure instead of hiding it behind the initial transport error', async () => {
  health
    .mockRejectedValueOnce(new Error('private'))
    .mockRejectedValueOnce(new HttpError(403, '', 'private'));
  await refreshRouteChecks(env);
  expect(recordedRelay()).toMatchObject({ healthy: false, reason: 'http-403' });
  expect(health).toHaveBeenCalledTimes(2);
});
it.each([
  [new HttpError(401, '', 'private'), 'http-401'],
  [new HttpError(403, '', 'private'), 'http-403'],
  [new HttpError(429, '', 'private'), 'http-429'],
  [new HttpError(99, '', 'private'), 'http-error'],
  [new HttpError(600, '', 'private'), 'http-error'],
  [new HttpError(503.5, '', 'private'), 'http-error'],
  [new DOMException('private', 'AbortError'), 'cancelled'],
  [new DirectRouteError('pinned-relay'), 'pinned-relay'],
  [new DirectRouteError('invalid-response'), 'invalid-response'],
  [new DirectRouteError('response-too-large'), 'response-too-large'],
  [new DirectRouteError('cancelled'), 'cancelled'],
  [new DirectRouteError('private-arbitrary-reason'), 'invalid-response'],
])(
  'does not retry authentication, semantic or unsafe failure reasons: %s',
  async (error, reason) => {
    health.mockRejectedValueOnce(error).mockResolvedValue({ state: 'ready' });
    await refreshRouteChecks(env);
    expect(recordedRelay()).toMatchObject({ healthy: false, reason });
    expect(health).toHaveBeenCalledTimes(1);
  },
);
it.each([
  [null, 'invalid-response'],
  [[], 'invalid-response'],
  [{ state: 'warming' }, 'unavailable'],
])('does not retry malformed or unready health responses: %s', async (body, reason) => {
  health.mockResolvedValueOnce(body).mockResolvedValue({ state: 'ready' });
  await refreshRouteChecks(env);
  expect(recordedRelay()).toMatchObject({ healthy: false, reason });
  expect(health).toHaveBeenCalledTimes(1);
});
it('does not turn a malformed confirmation into a successful recovery', async () => {
  health.mockRejectedValueOnce(new DirectRouteError('timeout')).mockResolvedValueOnce([]);
  await refreshRouteChecks(env);
  expect(recordedRelay()).toMatchObject({ healthy: false, reason: 'invalid-response' });
  expect(health).toHaveBeenCalledTimes(2);
});
