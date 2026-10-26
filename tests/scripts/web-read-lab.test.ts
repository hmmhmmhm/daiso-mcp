import { describe, expect, it, vi } from 'vitest';
import worker, { ProbeLog, type Storage } from '../../experiments/web-read-lab/worker.js';

function fixture() {
  const values = new Map<string, unknown>();
  let queue = Promise.resolve();
  const storage: Storage = {
    transaction<T>(callback: (tx: Pick<Storage, 'get' | 'put'>) => Promise<T>): Promise<T> {
      const result = queue.then(() => callback(storage));
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    setAlarm: vi.fn(async () => {}),
    deleteAll: vi.fn(async () => {
      values.clear();
    }),
  };
  const log = new ProbeLog({ storage });
  const env = { PROBE_LOG: { idFromName: () => 'global', get: () => log } };
  const get = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`https://lab.example${path}`, init), env);
  return { get, log, storage };
}

describe('독립 웹 읽기 실험', () => {
  it('실험 목록에서 새 링크를 따라 독립 실행을 시작할 수 있다', async () => {
    const { get } = fixture();
    const links: string[] = [];
    for (let i = 0; i < 2; i++) {
      const page = await (await get('/run/start')).text();
      const match = page.match(/href="([^" ]+)">새 실험 시작/);
      expect(match).not.toBeNull();
      links.push(match![1]);
      expect((await get(match![1])).status).toBe(200);
    }
    expect(links[0]).not.toBe(links[1]);
  });
  it('동시 요청의 도착과 완료 기록을 덮어쓰지 않는다', async () => {
    const { get } = fixture();
    await Promise.all(Array.from({ length: 20 }, () => get('/run/concurrent/html')));
    const { events } = await (await get('/observations/concurrent')).json();
    expect(events).toHaveLength(40);
    expect(new Set(events.map((event: { requestId: string }) => event.requestId)).size).toBe(20);
  });
  it('동일 가상 데이터를 HTML·JSON으로 제공하고 요청마다 생성 번호를 바꾼다', async () => {
    const { get } = fixture();
    const a = await get('/run/test/html');
    expect(a.headers.get('content-type')).toContain('text/html');
    expect(await a.text()).toContain('실험용 지갑');
    const b = await get('/run/test/json');
    const data = await b.json();
    expect(data.quantity).toBe(7);
    expect(data.requestId).not.toBe(a.headers.get('x-lab-request-id'));
    expect(b.headers.get('cache-control')).toBe('no-store');
  });
  it('경로·쿼리·리다이렉트·크기·캐시 조건이 독립적으로 동작한다', async () => {
    const { get } = fixture();
    for (const path of [
      'wallet',
      '%EC%A7%80%EA%B0%91',
      'query?q=wallet',
      'query?q=%EC%A7%80%EA%B0%91',
      'text',
      'noindex',
      'javascript',
    ]) {
      expect((await get(`/run/test/${path}`)).status).toBe(200);
    }
    expect((await get('/run/test/redirect')).headers.get('location')).toBe('/run/test/html');
    expect((await (await get('/run/test/large64')).arrayBuffer()).byteLength).toBe(65536);
    expect((await (await get('/run/test/large256')).arrayBuffer()).byteLength).toBe(262144);
    expect((await get('/run/test/cache')).headers.get('cache-control')).toBe('public, max-age=300');
    expect((await get('/run/test/unknown')).status).toBe(404);
    expect((await get('/run/test/html', { method: 'POST' })).status).toBe(405);
  });
  it('지연 중 도착을 기록하고 개인정보와 임의 쿼리를 저장하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const { get } = fixture();
      const pending = get('/run/test/delay5?private=secret', {
        headers: { cookie: 'private=secret', 'user-agent': 'ChatGPT-User/private' },
      });
      await vi.advanceTimersByTimeAsync(10);
      const before = await (await get('/observations/test')).json();
      expect(before.events).toHaveLength(1);
      expect(before.events[0].phase).toBe('received');
      expect(JSON.stringify(before)).not.toContain('secret');
      await vi.advanceTimersByTimeAsync(5000);
      expect((await pending).status).toBe(200);
      expect((await (await get('/observations/test')).json()).events).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('로그는 128개와 24시간으로 제한하고 알람으로 정리한다', async () => {
    vi.useFakeTimers();
    try {
      const { get, log, storage } = fixture();
      for (let i = 0; i < 70; i++) await get('/run/test/html');
      expect((await (await get('/observations/test')).json()).events).toHaveLength(128);
      await vi.advanceTimersByTimeAsync(86400001);
      expect((await (await get('/observations/test')).json()).events).toHaveLength(0);
      await log.alarm();
      expect(storage.deleteAll).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
