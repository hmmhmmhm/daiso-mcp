import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ direct: vi.fn(), route: vi.fn() }));
vi.mock('../../src/utils/directRoutes.js', () => ({ requestDirectRoute: mocks.direct }));
vi.mock('../../src/utils/routeHealth.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  routeOperation: mocks.route,
}));
import { requestConvenienceRelay } from '../../src/utils/convenienceTransport.js';
import { requestDtryxRelay } from '../../src/services/dtryx/transport.js';
import { requestOliveyoung } from '../../src/services/oliveyoung/transport.js';

const cases = [
  [
    'cu-stock',
    () =>
      requestConvenienceRelay(
        'cu-stock',
        { query: '우유' },
        { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'token' },
        10000,
      ),
  ],
  [
    'dtryx-movies',
    () =>
      requestDtryxRelay(
        'movies',
        { brandCode: 'K', cinemaCode: '000067' },
        { relayUrl: 'https://relay.example', relayToken: 'token' },
        10000,
      ),
  ],
  [
    'oy-product-search',
    () =>
      requestOliveyoung(
        '/oystore/api/stock/product-search-v3',
        { keyword: '크림' },
        { relayUrl: 'https://relay.example', relayToken: 'token', timeout: 10000 },
      ),
  ],
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('shared transports use saved route decisions', () => {
  it.each(cases)('%s invokes only selected direct path', async (key, call) => {
    mocks.route.mockImplementation((_key, _budget, direct) => direct(2500));
    mocks.direct.mockResolvedValue({ selected: 'direct' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await call()).toEqual({ selected: 'direct' });
    expect(mocks.route.mock.calls[0]?.slice(0, 2)).toEqual([key, 10000]);
    expect(mocks.direct.mock.calls[0]?.[0]).toBe(key);
    expect(mocks.direct.mock.calls[0]?.[2]).toBe(2500);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(cases)('%s retains authenticated relay fallback', async (_key, call) => {
    mocks.route.mockImplementation((_key, _budget, _direct, relay) => relay(7500));
    const result = {
      status: 'SUCCESS',
      success: true,
      RetCode: 'success',
      Recordset: [],
      data: [],
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal('fetch', fetch);
    await call();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.headers.Authorization).toBe('Bearer token');
    expect(mocks.direct).not.toHaveBeenCalled();
  });
});
