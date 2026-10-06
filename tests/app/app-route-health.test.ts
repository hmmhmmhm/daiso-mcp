import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn(), routing: vi.fn() }));
vi.mock('../../src/utils/routeHealth.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readRouteSnapshot: mocks.read,
  withRouteRouting: mocks.routing,
}));
vi.mock('../../src/utils/routeProbes.js', () => ({ refreshRouteChecks: mocks.refresh }));
import worker from '../../src/index.js';
const env = { HEALTH_CHECK_SECRET: 'secret', UPSTREAM_ROUTE_HEALTH: {} as DurableObjectNamespace };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ routes: {}, relays: {} });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.routing.mockImplementation((_namespace, _waitUntil, work) => work());
});
describe('operational route health', () => {
  it.each(['GET', 'POST'])('%s requires configured secret and authorization', async (method) => {
    expect((await worker.request('/api/health/routes', { method })).status).toBe(503);
    expect((await worker.request('/api/health/routes', { method }, env)).status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects missing shared storage after authorization', async () => {
    expect(
      (
        await worker.request(
          '/api/health/routes',
          { headers: { Authorization: 'Bearer secret' } },
          { HEALTH_CHECK_SECRET: 'secret' },
        )
      ).status,
    ).toBe(503);
  });
  it('GET reads the snapshot without probing', async () => {
    const result = await worker.request(
      '/api/health/routes',
      { headers: { 'x-health-check-key': 'secret' } },
      env,
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ success: true, data: { routes: {}, relays: {} } });
    expect(mocks.read).toHaveBeenCalledWith(env.UPSTREAM_ROUTE_HEALTH);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('POST performs fixed checks and returns the resulting snapshot', async () => {
    const result = await worker.request(
      '/api/health/routes',
      { method: 'POST', headers: { Authorization: 'Bearer secret' } },
      env,
    );
    expect(result.status).toBe(200);
    expect(mocks.refresh).toHaveBeenCalledWith(env);
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it.each(['read', 'refresh'])('reports %s failure without exposing details', async (failure) => {
    mocks[failure].mockRejectedValue(new Error('private token raw body'));
    const result = await worker.request(
      '/api/health/routes',
      {
        method: failure === 'refresh' ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer secret' },
      },
      env,
    );
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('private token');
  });
});

describe('worker background routing integration', () => {
  it('scheduled checks are registered with waitUntil', async () => {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({} as ScheduledController, env, {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    } as unknown as ExecutionContext);
    await Promise.all(pending);
    expect(mocks.refresh).toHaveBeenCalledWith(env);
    expect(pending).toHaveLength(1);
  });
  it('fetch installs binding and a bound background callback', async () => {
    const ctx = {
      waitUntil: vi.fn(function (this: unknown) {
        expect(this).toBe(ctx);
      }),
    };
    const response = await worker.fetch(
      new Request('https://mcp.test/health'),
      env,
      ctx as unknown as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const args = mocks.routing.mock.calls[0]!;
    expect(args[0]).toBe(env.UPSTREAM_ROUTE_HEALTH);
    args[1](Promise.resolve());
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });
  it('fetch remains compatible without an execution context or bindings', async () => {
    expect(
      (
        await worker.fetch(
          new Request('https://mcp.test/health'),
          undefined as unknown as typeof env,
          undefined as unknown as ExecutionContext,
        )
      ).status,
    ).toBe(200);
    expect(mocks.routing.mock.calls[0]?.slice(0, 2)).toEqual([undefined, undefined]);
  });
});
