import { describe, expect, it } from 'vitest';
import { UpstreamRouteHealth } from '../../src/durableObjects/upstreamRouteHealth.js';
function store() {
  let value: unknown;
  const storage = {
    get: async () => structuredClone(value),
    put: async (_key: string, data: unknown) => {
      value = structuredClone(data);
    },
    transaction: async (work: (s: unknown) => unknown) => work(storage),
  };
  const obj = new UpstreamRouteHealth({ storage } as unknown as DurableObjectState);
  const call = (path: string, data?: unknown) =>
    obj.fetch(
      new Request(
        `https://internal${path}`,
        data === undefined ? undefined : { method: 'POST', body: JSON.stringify(data) },
      ),
    );
  return { call };
}
describe('upstream route durable object', () => {
  it('merges partial checks and pins GS stock', async () => {
    const s = store();
    const checkedAt = Date.now();
    expect((await s.call('/snapshot')).status).toBe(200);
    expect(
      (
        await s.call('/checks', {
          checks: [{ key: 'cu-stock', direct: true, checkedAt }],
          relays: [{ group: 'convenience', healthy: true, checkedAt }],
        })
      ).status,
    ).toBe(204);
    await s.call('/checks', {
      checks: [{ key: 'gs25-stock', direct: true, checkedAt }],
      relays: [],
    });
    expect(await (await s.call('/snapshot')).json()).toMatchObject({
      routes: { 'cu-stock': { direct: true }, 'gs25-stock': { direct: false } },
      relays: { convenience: { healthy: true } },
    });
  });
  it('protects cooldown and newer failures from delayed probes', async () => {
    const s = store();
    const at = Date.now();
    await s.call('/failure', { key: 'cu-stock', at });
    await s.call('/checks', {
      checks: [{ key: 'cu-stock', direct: true, checkedAt: at - 1 }],
      relays: [],
    });
    await s.call('/checks', {
      checks: [{ key: 'cu-stock', direct: true, checkedAt: at + 1 }],
      relays: [],
    });
    expect(await (await s.call('/snapshot')).json()).toMatchObject({
      routes: { 'cu-stock': { direct: false, failedAt: at, blockedUntil: at + 300000 } },
    });
  });
  it.each([
    null,
    {},
    { checks: [], relays: 'x' },
    { checks: [{ key: 'unknown', direct: true, checkedAt: 1 }], relays: [] },
    {
      checks: [{ key: 'cu-stock', direct: true, checkedAt: 1, reason: 'secret token' }],
      relays: [],
    },
  ])('rejects invalid payload atomically %j', async (data) => {
    const s = store();
    expect((await s.call('/checks', data)).status).toBe(400);
    expect(await (await s.call('/snapshot')).json()).toEqual({ routes: {}, relays: {} });
  });
  it('rejects invalid failure, malformed JSON and unknown paths', async () => {
    const s = store();
    expect((await s.call('/failure', { key: 'wrong', at: 0 })).status).toBe(400);
    expect((await s.call('/other')).status).toBe(404);
  });
});

describe('durable state edge cases', () => {
  it('rejects oversized and malformed JSON and non-object payloads', async () => {
    const obj = new UpstreamRouteHealth({ storage: {} } as DurableObjectState);
    for (const body of ['x', '[]', JSON.stringify('x'.repeat(17000))])
      expect(
        (await obj.fetch(new Request('https://internal/checks', { method: 'POST', body }))).status,
      ).toBe(400);
  });
  it('omits secrets and ignores older checks, relays and failures', async () => {
    const s = store();
    const at = Date.now();
    await s.call('/checks', {
      checks: [{ key: 'cu-stock', direct: true, checkedAt: at, reason: 'ok', token: 'secret' }],
      relays: [{ group: 'convenience', healthy: true, checkedAt: at, reason: 'ok' }],
    });
    await s.call('/checks', {
      checks: [{ key: 'cu-stock', direct: false, checkedAt: at - 1 }],
      relays: [{ group: 'convenience', healthy: false, checkedAt: at - 1 }],
    });
    await s.call('/failure', { key: 'cu-stock', at: at - 1 });
    const result = await (await s.call('/snapshot')).json();
    expect(result).toMatchObject({
      routes: { 'cu-stock': { direct: false, reason: 'unavailable' } },
      relays: { convenience: { healthy: true, reason: 'ok' } },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    await s.call('/failure', { key: 'cu-stock', at });
    await s.call('/failure', { key: 'cu-stock', at });
  });
  it('allows healthy probe only after the failure cooldown expires', async () => {
    const s = store();
    const at = Date.now() - 300001;
    await s.call('/failure', { key: 'cu-stock', at });
    await s.call('/checks', {
      checks: [{ key: 'cu-stock', direct: true, checkedAt: Date.now(), reason: 'ok' }],
      relays: [],
    });
    expect(await (await s.call('/snapshot')).json()).toMatchObject({
      routes: { 'cu-stock': { direct: true, failedAt: at } },
    });
  });
  it.each([
    { checks: [null], relays: [] },
    { checks: [], relays: [null] },
    { checks: [{ key: 'cu-stock', direct: 'yes', checkedAt: 1 }], relays: [] },
    { checks: [], relays: [{ group: 'bad', healthy: true, checkedAt: 1 }] },
    { checks: [], relays: [{ group: 'dtryx', healthy: 'yes', checkedAt: 1 }] },
    { checks: [{ key: 'cu-stock', direct: true, checkedAt: -1 }], relays: [] },
    { checks: [{ key: 'cu-stock', direct: true, checkedAt: Date.now() + 90000 }], relays: [] },
    { checks: Array(21).fill({ key: 'cu-stock', direct: true, checkedAt: 1 }), relays: [] },
    { checks: [], relays: Array(4).fill({ group: 'dtryx', healthy: true, checkedAt: 1 }) },
  ])('rejects invalid values %j', async (data) => {
    expect((await store().call('/checks', data)).status).toBe(400);
  });
});

it.each([
  'pinned-relay',
  'http-error',
  'network-error',
  'invalid-response',
  'response-too-large',
  'cancelled',
  'invalid-input',
])('accepts fixed probe diagnostic %s', async (reason) => {
  expect(
    (
      await store().call('/checks', {
        checks: [{ key: 'cu-stock', direct: false, checkedAt: 1, reason }],
        relays: [],
      })
    ).status,
  ).toBe(204);
});

it('keeps cooldown when a newer probe arrives before a delayed actual failure', async () => {
  const s = store();
  const at = Date.now();
  await s.call('/checks', {
    checks: [{ key: 'cu-stock', direct: true, checkedAt: at + 1 }],
    relays: [],
  });
  await s.call('/failure', { key: 'cu-stock', at });
  expect(await (await s.call('/snapshot')).json()).toMatchObject({
    routes: { 'cu-stock': { direct: false, failedAt: at, blockedUntil: at + 300000 } },
  });
});
it('ignores a delayed failure superseded by a success after its full cooldown', async () => {
  const s = store();
  const checkedAt = Date.now();
  await s.call('/checks', { checks: [{ key: 'cu-stock', direct: true, checkedAt }], relays: [] });
  await s.call('/failure', { key: 'cu-stock', at: checkedAt - 300001 });
  expect(await (await s.call('/snapshot')).json()).toMatchObject({
    routes: { 'cu-stock': { direct: true } },
  });
});
