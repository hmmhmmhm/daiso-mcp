import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../src/utils/http.js';
import {
  routeOperation,
  readRouteSnapshot,
  writeRouteChecks,
  withRouteRouting,
  type RouteSnapshot,
} from '../../src/utils/routeHealth.js';

let sequence = 0;
function namespace(snapshot: RouteSnapshot = { routes: {}, relays: {} }) {
  const pending: Promise<unknown>[] = [];
  const fetch = vi.fn(async () => Response.json(snapshot));
  const id = `namespace-${sequence++}`;
  const ns = {
    idFromName: () => ({ toString: () => id }),
    get: () => ({ fetch }),
  } as unknown as DurableObjectNamespace;
  const run = (
    key = 'cu-stock' as const,
    direct = vi.fn(async () => 'direct'),
    relay = vi.fn(async () => 'relay'),
    signal?: AbortSignal,
  ) =>
    withRouteRouting(
      ns,
      (p) => pending.push(p),
      () => routeOperation(key, 10000, direct, relay, signal),
    );
  return { ns, fetch, pending, run };
}
async function warm(snapshot: RouteSnapshot) {
  const n = namespace(snapshot);
  await n.run();
  await Promise.all(n.pending);
  n.fetch.mockClear();
  n.pending.length = 0;
  return n;
}
beforeEach(() => {
  vi.useRealTimers();
});
describe('route health', () => {
  it('preserves old relay routing without complete context', async () => {
    const direct = vi.fn(async () => 'direct');
    const relay = vi.fn(async (ms) => ms);
    expect(await routeOperation('cu-stock', 7000, direct, relay)).toBe(7000);
    expect(
      await withRouteRouting(namespace().ns, undefined, () =>
        routeOperation('cu-stock', 7000, direct, relay),
      ),
    ).toBe(7000);
    expect(direct).not.toHaveBeenCalled();
  });
  it('cold decisions never await snapshot and warm decisions use direct', async () => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    const direct = vi.fn(async (ms) => `direct-${ms}`);
    expect(await n.run(undefined, direct)).toBe('direct-3000');
    expect(n.fetch).not.toHaveBeenCalled();
  });
  it('cold pending snapshot cannot delay relay', async () => {
    const n = namespace();
    n.fetch.mockImplementation(() => new Promise(() => {}));
    expect(await n.run()).toBe('relay');
  });
  it('isolates namespaces and pins GS stock', async () => {
    const n = await warm({
      routes: { 'gs25-stock': { key: 'gs25-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    expect(
      await withRouteRouting(
        n.ns,
        (p) => n.pending.push(p),
        () =>
          routeOperation(
            'gs25-stock',
            1000,
            async () => 'direct',
            async () => 'relay',
          ),
      ),
    ).toBe('relay');
    expect(await namespace().run()).toBe('relay');
  });
  it('fails over and immediately blocks subsequent direct calls', async () => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    const direct = vi.fn(async () => {
      throw new HttpError(403, 'Forbidden', 'secret');
    });
    expect(await n.run(undefined, direct)).toBe('relay');
    expect(await n.run(undefined, direct)).toBe('relay');
    expect(direct).toHaveBeenCalledTimes(1);
    await Promise.all(n.pending);
    expect(n.fetch.mock.calls.length).toBe(1);
  });
  it.each([400, 404, 422])('preserves caller HTTP %s errors', async (status) => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    const error = new HttpError(status, '', '');
    const relay = vi.fn(async () => 'relay');
    await expect(
      n.run(
        undefined,
        async () => {
          throw error;
        },
        relay,
      ),
    ).rejects.toBe(error);
    expect(relay).not.toHaveBeenCalled();
  });
  it('fails fast only on fresh evidence that both paths are unavailable', async () => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: false, checkedAt: Date.now() } },
      relays: { convenience: { group: 'convenience', healthy: false, checkedAt: Date.now() } },
    });
    await expect(n.run()).rejects.toMatchObject({ status: 503 });
  });
  it('does not fail over when caller aborts', async () => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    const c = new AbortController();
    const relay = vi.fn(async () => 'relay');
    await expect(
      n.run(
        undefined,
        async () => {
          c.abort();
          throw c.signal.reason;
        },
        relay,
        c.signal,
      ),
    ).rejects.toBe(c.signal.reason);
    expect(relay).not.toHaveBeenCalled();
  });
  it('returns safe snapshot on read errors and hides write errors', async () => {
    const n = namespace();
    n.fetch.mockRejectedValue(new Error('secret'));
    expect(await readRouteSnapshot(n.ns)).toEqual({ routes: {}, relays: {} });
    await expect(writeRouteChecks(n.ns, [], [])).resolves.toBeUndefined();
  });
});

describe('routing edge cases', () => {
  it('preserves stale and blocked routing while refreshing without awaiting', async () => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() - 600001 } },
      relays: { convenience: { group: 'convenience', healthy: false, checkedAt: 0 } },
    });
    expect(await n.run()).toBe('relay');
    const blocked = await warm({
      routes: {
        'cu-stock': {
          key: 'cu-stock',
          direct: true,
          checkedAt: Date.now(),
          failedAt: Date.now(),
          blockedUntil: Date.now() + 300000,
        },
      },
      relays: {},
    });
    expect(await blocked.run()).toBe('relay');
  });
  it('keeps actual failure when pending older snapshot arrives', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: now } },
      relays: {},
    });
    let fail!: (error: Error) => void;
    const active = n.run(
      undefined,
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    vi.advanceTimersByTime(30001);
    let release!: (r: Response) => void;
    n.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    expect(await n.run()).toBe('relay');
    fail(new Error('network'));
    await expect(active).rejects.toThrow('network');
    release(
      Response.json({
        routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: now } },
        relays: {},
      }),
    );
    await Promise.all(n.pending);
    expect(await n.run()).toBe('relay');
    vi.useRealTimers();
  });
  it('does not call fallback when original budget is exhausted', async () => {
    vi.useFakeTimers();
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    const error = new Error('failure');
    const relay = vi.fn(async () => 'relay');
    await expect(
      n.run(
        undefined,
        async () => {
          vi.advanceTimersByTime(10001);
          throw error;
        },
        relay,
      ),
    ).rejects.toBe(error);
    expect(relay).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('reduces fallback budget by elapsed direct time', async () => {
    vi.useFakeTimers();
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    const relay = vi.fn(async () => 'relay');
    await n.run(
      undefined,
      async () => {
        vi.advanceTimersByTime(350);
        throw new Error('shape');
      },
      relay,
    );
    expect(relay).toHaveBeenCalledWith(9650);
    vi.useRealTimers();
  });
  it('rejects an already aborted caller before any callback', async () => {
    const c = new AbortController();
    c.abort();
    const relay = vi.fn(async () => 'relay');
    await expect(namespace().run(undefined, undefined, relay, c.signal)).rejects.toBe(
      c.signal.reason,
    );
    expect(relay).not.toHaveBeenCalled();
  });
  it('safely ignores unavailable namespace identifiers', async () => {
    const ns = {
      idFromName: () => {
        throw new Error('binding');
      },
    } as unknown as DurableObjectNamespace;
    expect(
      await withRouteRouting(
        ns,
        () => {},
        () =>
          routeOperation(
            'cu-stock',
            1000,
            async () => 'direct',
            async () => 'relay',
          ),
      ),
    ).toBe('relay');
  });
  it('bounds reads, JSON bodies, and writes even when fetch ignores abort', async () => {
    vi.useFakeTimers();
    const n = namespace();
    n.fetch.mockImplementation(() => new Promise(() => {}));
    const read = readRouteSnapshot(n.ns);
    const write = writeRouteChecks(n.ns, [], []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await read).toEqual({ routes: {}, relays: {} });
    await write;
    const body = new ReadableStream();
    n.fetch.mockResolvedValue(new Response(body));
    const readBody = readRouteSnapshot(n.ns);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await readBody).toEqual({ routes: {}, relays: {} });
    vi.useRealTimers();
  });
  it.each([null, {}, { routes: null, relays: {} }, { routes: {}, relays: null }])(
    'sanitizes malformed snapshot %j',
    async (raw) => {
      const n = namespace();
      n.fetch.mockResolvedValue(Response.json(raw));
      expect(await readRouteSnapshot(n.ns)).toEqual({ routes: {}, relays: {} });
    },
  );
  it('ignores non-success snapshot response', async () => {
    const n = namespace();
    n.fetch.mockResolvedValue(new Response('', { status: 500 }));
    expect(await readRouteSnapshot(n.ns)).toEqual({ routes: {}, relays: {} });
  });
  it('rejects malformed entries while copying only safe metadata', async () => {
    const n = namespace();
    n.fetch.mockResolvedValue(
      Response.json({
        routes: {
          'cu-stock': { key: 'cu-store', direct: true, checkedAt: 1 },
          'cu-prime': {
            key: 'cu-prime',
            direct: true,
            checkedAt: Date.now(),
            failedAt: 1,
            blockedUntil: 'invalid',
            reason: 'ok',
            token: 'secret',
          },
        },
        relays: {
          convenience: { group: 'dtryx', healthy: true, checkedAt: 1 },
          dtryx: {
            group: 'dtryx',
            healthy: true,
            checkedAt: Date.now(),
            reason: 'ok',
            token: 'secret',
          },
        },
      }),
    );
    const result = await readRouteSnapshot(n.ns);
    expect(result.routes['cu-stock']).toBeUndefined();
    expect(result.routes['cu-prime']).toEqual({
      key: 'cu-prime',
      direct: true,
      checkedAt: expect.any(Number),
      failedAt: 1,
      reason: 'ok',
    });
    expect(result.relays.dtryx).not.toHaveProperty('token');
    expect(result.relays.convenience).toBeUndefined();
  });
  it.each(['oy-find-store', 'dtryx-movies'] as const)('maps %s relay group', async (key) => {
    const n = await warm({
      routes: { [key]: { key, direct: false, checkedAt: Date.now() } },
      relays: {
        oliveyoung: { group: 'oliveyoung', healthy: false, checkedAt: Date.now() },
        dtryx: { group: 'dtryx', healthy: false, checkedAt: Date.now() },
      },
    });
    await expect(
      withRouteRouting(
        n.ns,
        () => {},
        () =>
          routeOperation(
            key,
            1000,
            async () => 'direct',
            async () => 'relay',
          ),
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

it('handles rejected background failure writes', async () => {
  const n = await warm({
    routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
    relays: {},
  });
  n.fetch.mockRejectedValue(new Error('storage unavailable'));
  expect(
    await n.run(undefined, async () => {
      throw new Error('network');
    }),
  ).toBe('relay');
  await expect(Promise.all(n.pending)).resolves.toBeDefined();
});

it('recovers after an unpersisted failure when a probe after cooldown succeeds', async () => {
  vi.useFakeTimers();
  const at = Date.now();
  const n = await warm({
    routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: at } },
    relays: {},
  });
  n.fetch.mockRejectedValueOnce(new Error('storage write failed'));
  await n.run(undefined, async () => {
    throw new HttpError(403, '', '');
  });
  await Promise.all(n.pending);
  vi.advanceTimersByTime(300001);
  n.fetch.mockResolvedValue(
    Response.json({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    }),
  );
  await n.run();
  await Promise.all(n.pending);
  expect(await n.run()).toBe('direct');
});
it('does not call a known unhealthy relay after an unexpected direct failure', async () => {
  const at = Date.now();
  const n = await warm({
    routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: at } },
    relays: { convenience: { group: 'convenience', healthy: false, checkedAt: at } },
  });
  const relay = vi.fn(async () => 'relay');
  await expect(
    n.run(
      undefined,
      async () => {
        throw new HttpError(403, '', '');
      },
      relay,
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(relay).not.toHaveBeenCalled();
});

it('uses relay while an expired snapshot is being refreshed', async () => {
  vi.useFakeTimers();
  const at = Date.now();
  const n = await warm({
    routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: at } },
    relays: {},
  });
  vi.advanceTimersByTime(30001);
  n.fetch.mockImplementation(() => new Promise(() => {}));
  expect(await n.run()).toBe('relay');
  expect(await n.run()).toBe('relay');
});

it('keeps a local failure when storage returns an empty snapshot', async () => {
  vi.useFakeTimers();
  const at = Date.now();
  const n = await warm({
    routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: at } },
    relays: {},
  });
  n.fetch.mockRejectedValueOnce(new Error('write failed'));
  await n.run(undefined, async () => {
    throw new HttpError(403, '', '');
  });
  await Promise.all(n.pending);
  vi.advanceTimersByTime(30001);
  n.fetch.mockResolvedValue(Response.json({ routes: {}, relays: {} }));
  await n.run();
  await Promise.all(n.pending);
  expect(await n.run()).toBe('relay');
});

it.each([204, 302, 405, 408])(
  'falls back on unexpected HTTP %s rather than treating it as caller input',
  async (status) => {
    const n = await warm({
      routes: { 'cu-stock': { key: 'cu-stock', direct: true, checkedAt: Date.now() } },
      relays: {},
    });
    expect(
      await n.run(undefined, async () => {
        throw new HttpError(status, '', '');
      }),
    ).toBe('relay');
  },
);

it('uses relay during snapshot refresh even if the expired cache had both paths down', async () => {
  vi.useFakeTimers();
  const at = Date.now();
  const n = await warm({
    routes: { 'cu-stock': { key: 'cu-stock', direct: false, checkedAt: at } },
    relays: { convenience: { group: 'convenience', healthy: false, checkedAt: at } },
  });
  vi.advanceTimersByTime(30001);
  n.fetch.mockImplementation(() => new Promise(() => {}));
  expect(await n.run()).toBe('relay');
});
