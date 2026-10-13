import { describe, expect, it, vi } from 'vitest';
import { GeocodeGate, type GeocodeReply, type GeocodeQuotaStore } from '../../src/utils/geocodeGate.js';

const scope = 'a'.repeat(64);
const ok: GeocodeReply = { status: 200, body: { documents: [] } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function memoryStore(): GeocodeQuotaStore & { values: Map<string, number> } {
  const values = new Map<string, number>();
  return { values, get: async (key) => values.get(key), put: async (key, value) => { values.set(key, value); } };
}

describe('GeocodeGate', () => {
  it('동일 진행 요청만 병합하고 반환값을 복제하며 완료 후 다시 호출한다', async () => {
    const gate = new GeocodeGate();
    const held = deferred<GeocodeReply>();
    const work = vi.fn(() => held.promise);
    const one = gate.run(scope, 'kakao-address', 'query', 100, work);
    const two = gate.run(scope, 'kakao-address', 'query', 100, work);
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(1);
    held.resolve({ status: 200, body: { nested: { value: 1 } } });
    const [a, b] = await Promise.all([one, two]);
    expect(a).toEqual(b);
    expect(a.body).not.toBe(b.body);
    await gate.run(scope, 'kakao-address', 'query', 100, work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it.each(['kakao-address', 'kakao-keyword', 'naver-local'] as const)('429는 %s 공급자를 60초 차단한다', async (provider) => {
    let now = 1000;
    const store = memoryStore();
    const gate = new GeocodeGate(store, () => now);
    const work = vi.fn(async () => ({ status: 429, body: {} }));
    await gate.run(scope, provider, 'one', 10, work);
    expect(store.values.get(`quota:${scope}:${provider}`)).toBe(61000);
    expect(await gate.run(scope, provider, 'two', 10, work)).toEqual({ status: 429, body: { code: 'GEOCODE_QUOTA_BLOCKED' } });
    expect(work).toHaveBeenCalledTimes(1);
    now = 61000;
    await gate.run(scope, provider, 'three', 10, work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('카카오 -10은 30분 저장하고 다른 scope와 endpoint를 차단하지 않는다', async () => {
    const store = memoryStore();
    const gate = new GeocodeGate(store, () => 1000);
    await gate.run(scope, 'kakao-address', 'q', 10, async () => ({ status: 400, body: { code: -10 } }));
    expect([...store.values]).toEqual([[`quota:${scope}:kakao-address`, 1801000]]);
    const work = vi.fn(async () => ok);
    await gate.run(scope, 'kakao-keyword', 'q', 10, work);
    await gate.run('b'.repeat(64), 'kakao-address', 'q', 10, work);
    expect(work).toHaveBeenCalledTimes(2);
    const restarted = new GeocodeGate(store, () => 1001);
    await restarted.run(scope, 'kakao-address', 'q', 10, work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: 400, body: { code: -1 } }, { status: 400, body: null },
    { status: 400, body: { code: '-10' } }, { status: 401, body: { code: -10 } },
    { status: 403, body: {} }, { status: 500, body: {} }, ok,
  ])('일반 오류와 빈 결과는 저장하지 않는다: %j', async (reply) => {
    const store = memoryStore();
    const gate = new GeocodeGate(store);
    await gate.run(scope, 'kakao-address', 'q', 10, async () => reply);
    expect(store.values.size).toBe(0);
  });

  it('네이버의 400 -10은 카카오 quota로 취급하지 않는다', async () => {
    const store = memoryStore();
    await new GeocodeGate(store).run(scope, 'naver-local', 'q', 10, async () => ({ status: 400, body: { code: -10 } }));
    expect(store.values.size).toBe(0);
  });

  it('다른 시간 예산과 파라미터는 병합하지 않는다', async () => {
    const gate = new GeocodeGate();
    const held = deferred<GeocodeReply>();
    const work = vi.fn(() => held.promise);
    const pending = [gate.run(scope, 'kakao-address', 'q', 10, work), gate.run(scope, 'kakao-address', 'q', 20, work), gate.run(scope, 'kakao-address', 'other', 10, work)];
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(3);
    held.resolve(ok);
    await Promise.all(pending);
  });

  it('전송 실패도 공유하고 완료된 실패는 재사용하지 않는다', async () => {
    const gate = new GeocodeGate();
    const held = deferred<GeocodeReply>();
    const work = vi.fn(() => held.promise);
    const one = gate.run(scope, 'kakao-address', 'q', 10, work);
    const two = gate.run(scope, 'kakao-address', 'q', 10, work);
    const checks = Promise.all([expect(one).rejects.toThrow('transport'), expect(two).rejects.toThrow('transport')]);
    held.reject(new Error('transport'));
    await checks;
    await expect(gate.run(scope, 'kakao-address', 'q', 10, async () => ok)).resolves.toEqual(ok);
  });

  it.each(['get', 'put'] as const)('저장소 %s 오류는 고정 오류로 닫힌다', async (operation) => {
    const store = memoryStore();
    store[operation] = async () => { throw new Error('secret address'); };
    const gate = new GeocodeGate(store);
    await expect(gate.run(scope, 'kakao-address', 'q', 10, async () => ({ status: 429, body: {} }))).rejects.toThrow('GEOCODE_QUOTA_STORE_UNAVAILABLE');
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('손상된 저장 timestamp를 거부한다: %s', async (value) => {
    const work = vi.fn(async () => ok);
    const store = { get: async () => value, put: async () => {} };
    await expect(new GeocodeGate(store).run(scope, 'kakao-address', 'q', 10, work)).rejects.toThrow('GEOCODE_QUOTA_STORE_UNAVAILABLE');
    expect(work).not.toHaveBeenCalled();
  });

  it('고유 pending을 32개로 제한하고 완료 후 자리를 회수한다', async () => {
    const gate = new GeocodeGate();
    const held = deferred<GeocodeReply>();
    const calls = Array.from({ length: 32 }, (_, i) => gate.run(scope, 'kakao-address', String(i), 10, () => held.promise));
    await expect(gate.run(scope, 'kakao-address', 'overflow', 10, async () => ok)).rejects.toThrow('GEOCODE_GATE_CAPACITY');
    held.resolve(ok);
    await Promise.all(calls);
    await expect(gate.run(scope, 'kakao-address', 'next', 10, async () => ok)).resolves.toEqual(ok);
  });

  it('차단 scope를 64개로 제한하고 만료 후 회수한다', async () => {
    let now = 1;
    const gate = new GeocodeGate(undefined, () => now);
    for (let i = 0; i < 64; i++) await gate.run(i.toString(16).padStart(64, '0'), 'kakao-address', 'q', 10, async () => ({ status: 429, body: {} }));
    await expect(gate.run('f'.repeat(64), 'kakao-address', 'q', 10, async () => ok)).rejects.toThrow('GEOCODE_GATE_CAPACITY');
    now = 60001;
    await expect(gate.run('f'.repeat(64), 'kakao-address', 'q', 10, async () => ok)).resolves.toEqual(ok);
  });

  it('동시 quota 저장은 더 긴 중단 시간을 짧은 값으로 덮어쓰지 않는다', async () => {
    const store = memoryStore();
    const gate = new GeocodeGate(store, () => 1);
    const long = deferred<GeocodeReply>();
    const short = deferred<GeocodeReply>();
    const a = gate.run(scope, 'kakao-address', 'long', 10, () => long.promise);
    const b = gate.run(scope, 'kakao-address', 'short', 10, () => short.promise);
    await Promise.resolve();
    long.resolve({ status: 400, body: { code: -10 } });
    await a;
    short.resolve({ status: 429, body: {} });
    await b;
    expect(store.values.get(`quota:${scope}:kakao-address`)).toBe(1800001);
  });
  it('느린 초기 읽기가 새 차단 상태를 해제하지 않는다', async () => {
    const stale = deferred<number | undefined>();
    let reads = 0;
    const store = memoryStore();
    store.get = async () => ++reads === 2 ? stale.promise : undefined;
    const gate = new GeocodeGate(store, () => 1);
    const held = deferred<GeocodeReply>();
    const first = gate.run(scope, 'kakao-address', 'first', 10, () => held.promise);
    const work = vi.fn(async () => ok);
    const second = gate.run(scope, 'kakao-address', 'second', 10, work);
    await Promise.resolve();
    held.resolve({ status: 400, body: { code: -10 } });
    await first;
    stale.resolve(undefined);
    expect(await second).toEqual({ status: 429, body: { code: 'GEOCODE_QUOTA_BLOCKED' } });
    expect(work).not.toHaveBeenCalled();
    expect(store.values.get(`quota:${scope}:kakao-address`)).toBe(1800001);
  });

  it('진행 중 quota 저장을 직렬화하고 저장 실패 뒤 다시 시도한다', async () => {
    const saving = deferred<void>();
    const long = deferred<GeocodeReply>();
    const short = deferred<GeocodeReply>();
    const store = memoryStore();
    const writes: number[] = [];
    store.put = async (_key, value) => {
      writes.push(value);
      if (writes.length === 1) await saving.promise;
    };
    const gate = new GeocodeGate(store, () => 1);
    const a = gate.run(scope, 'kakao-address', 'long', 10, () => long.promise);
    const b = gate.run(scope, 'kakao-address', 'short', 10, () => short.promise);
    await Promise.resolve();
    long.resolve({ status: 400, body: { code: -10 } });
    short.resolve({ status: 429, body: {} });
    const checks = Promise.all([expect(a).rejects.toThrow('GEOCODE_QUOTA_STORE_UNAVAILABLE'), expect(b).resolves.toEqual({ status: 429, body: {} })]);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    saving.reject(new Error('private'));
    await checks;
    expect(writes).toEqual([1800001, 1800001]);
  });

  it('공유 초기화 실패는 모든 caller에 전파하며 다음 요청에서 읽기를 재시도한다', async () => {
    const loading = deferred<number | undefined>();
    const store = memoryStore();
    const get = vi.fn(() => loading.promise);
    store.get = get;
    const gate = new GeocodeGate(store);
    const work = vi.fn(async () => ok);
    const a = gate.run(scope, 'kakao-address', 'q', 10, work);
    const b = gate.run(scope, 'kakao-address', 'q', 10, work);
    const checks = Promise.all([expect(a).rejects.toThrow('GEOCODE_QUOTA_STORE_UNAVAILABLE'), expect(b).rejects.toThrow('GEOCODE_QUOTA_STORE_UNAVAILABLE')]);
    loading.reject(new Error('private'));
    await checks;
    expect(get).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
    store.get = async () => undefined;
    await expect(gate.run(scope, 'kakao-address', 'q', 10, work)).resolves.toEqual(ok);
  });

  it('기본 시계와 저장된 0 timestamp를 처리한다', async () => {
    const store = memoryStore();
    store.values.set(`quota:${scope}:kakao-address`, 0);
    await expect(new GeocodeGate(store).run(scope, 'kakao-address', 'q', 10, async () => ok)).resolves.toEqual(ok);
  });

});
