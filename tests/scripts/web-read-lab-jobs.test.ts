import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { ProbeLog, type Storage } from '../../experiments/web-read-lab/worker.js';

function fixture() {
  const objects = new Map<string, ProbeLog>();
  const env = {
    PROBE_LOG: {
      idFromName: (name: string) => name,
      get(id: unknown) {
        const key = String(id);
        if (!objects.has(key)) {
          const values = new Map<string, unknown>();
          let queue = Promise.resolve();
          const storage: Storage = {
            transaction<T>(fn: (tx: Pick<Storage, 'get' | 'put'>) => Promise<T>) {
              const result = queue.then(() => fn(storage));
              queue = result.then(
                () => {},
                () => {},
              );
              return result;
            },
            get: async (name) => values.get(name),
            put: async (name, value) => {
              values.set(name, value);
            },
            setAlarm: vi.fn(async () => {}),
            deleteAll: async () => {
              values.clear();
            },
          };
          objects.set(key, new ProbeLog({ storage }));
        }
        return objects.get(key)!;
      },
    },
  };
  return {
    env,
    get: (path: string) => worker.fetch(new Request(`https://lab.example${path}`), env),
  };
}
afterEach(() => vi.useRealTimers());

describe('웹 읽기 저장 결과와 접수 실험', () => {
  it('즉시 접수하고 실제 결과 링크에서 pending과 완료를 구별한다', async () => {
    vi.useFakeTimers();
    const { get, env } = fixture();
    const first = await get('/run/staged/start5');
    expect(first.status).toBe(200);
    const body = await first.text();
    expect(body).toContain('pending');
    expect(body).toContain('href="/run/staged/result5"');
    expect(await (await get('/run/staged/result5')).text()).toContain('pending');
    await vi.advanceTimersByTimeAsync(5000);
    await env.PROBE_LOG.get('job-staged').alarm();
    const ready = await get('/run/staged/result5');
    expect(await ready.text()).toContain('ready');
    expect(ready.headers.get('cache-control')).toBe('no-store');
  });
  it('첫 조회만 느리고 재시도는 동일한 저장 결과를 즉시 반환한다', async () => {
    vi.useFakeTimers();
    const { get } = fixture();
    let done = false;
    const cold = get('/run/cold/cold5').then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const first = await (await cold).text();
    expect(first).toContain('ready');
    const second = await (await get('/run/cold/cold5')).text();
    expect(second.match(/"resultId": "([^"]+)"/)?.[1]).toBe(
      first.match(/"resultId": "([^"]+)"/)?.[1],
    );
    expect(first.match(/"resultId": "([^"]+)"/)?.[1]).toBeTruthy();
    expect(second).toContain('cacheHit');
  });
  it('동시 접수는 한 작업을 공유하며 알람이 결과를 보존하고 만료 후 정리한다', async () => {
    vi.useFakeTimers();
    const { get, env } = fixture();
    const [a, b] = await Promise.all([get('/run/shared/start5'), get('/run/shared/start5')]);
    const id = (s: string) => s.match(/"jobId": "([^"]+)"/)?.[1];
    const first = id(await a.text());
    expect(first).toBeTruthy();
    expect(id(await b.text())).toBe(first);
    expect((await get('/run/unknown/result5')).status).toBe(404);
    await vi.advanceTimersByTimeAsync(5000);
    await env.PROBE_LOG.get('job-shared').alarm();
    const ready = await (await get('/run/shared/result5')).text();
    expect(ready).toContain('completedAt');
    await vi.advanceTimersByTimeAsync(86400001);
    await env.PROBE_LOG.get('job-shared').alarm();
    expect((await get('/run/shared/result5')).status).toBe(404);
  });
});
