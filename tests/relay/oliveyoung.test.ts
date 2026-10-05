import { expect, it, vi } from 'vitest';
import { createOliveyoungRelay } from '../../scripts/relay/oliveyoung.js';
let consumerSequence = 0;
const consumerHeaders = () => ({ 'x-relay-consumer': (++consumerSequence).toString(16).padStart(64, '0') });
const payload = { goodsNo: 'A1' };
const request = (path = 'stock-goods-info-v3', body = JSON.stringify(payload), token = 'test') =>
  new Request(`http://localhost/v1/oliveyoung/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...consumerHeaders() },
    body,
  });
it('인증 실패 시 브라우저를 호출하지 않는다', async () => {
  const runner = vi.fn();
  const relay = createOliveyoungRelay('test', runner);
  expect((await relay(request(undefined, undefined, 'bad'))).status).toBe(401);
  expect(runner).not.toHaveBeenCalled();
});
it('허용된 경로와 검증한 JSON만 브라우저로 전달한다', async () => {
  const result = { status: 'SUCCESS', data: { goodsInfo: {} } };
  const runner = vi.fn().mockResolvedValue(result);
  const relay = createOliveyoungRelay('test', runner);
  expect(await (await relay(request())).json()).toEqual(result);
  expect(runner).toHaveBeenCalledWith('/oystore/api/stock/stock-goods-info-v3', payload);
  expect((await relay(request('https://evil.example'))).status).toBe(404);
  expect((await relay(request(undefined, '{'))).status).toBe(400);
  expect((await relay(request(undefined, '{}'))).status).toBe(400);
  expect((await relay(request(undefined, 'x'.repeat(16385)))).status).toBe(413);
  expect(runner).toHaveBeenCalledTimes(1);
});
it('브라우저 오류를 숨기고 동시 요청을 제한한다', async () => {
  let reject!: (reason: Error) => void;
  const runner = vi.fn().mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const relay = createOliveyoungRelay('test', runner);
  const first = relay(request());
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const queued = Array.from({ length: 7 }, (_, i) =>
    relay(request(undefined, JSON.stringify({ goodsNo: String(i) }))),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect((await relay(request())).status).toBe(503);
  runner.mockResolvedValue({ status: 'SUCCESS' });
  reject(new Error('secret details'));
  const response = await first;
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret');
  expect((await Promise.all(queued)).every((item) => item.status === 200)).toBe(true);
  runner.mockResolvedValue({ status: 'SUCCESS' });
  expect((await relay(request())).status).toBe(200);
});
it('대기 중 취소된 요청은 브라우저 작업을 생략한다', async () => {
  let finish!: (value: { status: string }) => void;
  const runner = vi.fn().mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const relay = createOliveyoungRelay('test', runner);
  const first = relay(request());
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const controller = new AbortController();
  const pending = relay(new Request(request(), { signal: controller.signal }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  finish({ status: 'SUCCESS' });
  await first;
  expect((await pending).status).toBe(503);
  expect(runner).toHaveBeenCalledTimes(1);
});
it('누락 인증, 빈 토큰, 잘못된 메서드와 요청 형태를 거절한다', async () => {
  const runner = vi.fn();
  expect(() => createOliveyoungRelay(' ', runner)).toThrow('OY_RELAY_TOKEN');
  const relay = createOliveyoungRelay('test', runner);
  expect((await relay(new Request('http://localhost/v1/oliveyoung/find-store'))).status).toBe(401);
  expect(
    (
      await relay(
        new Request('http://localhost/v1/oliveyoung/find-store', {
          headers: { Authorization: 'Bearer test', ...consumerHeaders() },
        }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await relay(
        new Request('http://localhost/v1/oliveyoung/find-store', {
          method: 'POST',
          headers: { Authorization: 'Bearer test', ...consumerHeaders() },
        }),
      )
    ).status,
  ).toBe(400);
  for (const body of [
    'null',
    '[]',
    '1',
    '{"goodsNo":4}',
    '{"goodsNo":"A1","url":"https://evil.example"}',
    '{"lat":1e400,"lon":1,"pageIdx":1,"searchWords":"","pogKeys":"","serviceKeys":"","mapLat":1,"mapLon":1}',
  ]) {
    expect(
      (await relay(request(body.includes('lat') ? 'find-store' : undefined, body))).status,
    ).toBe(400);
  }
  expect((await relay(request('stock-goods-info-v3?x=1'))).status).toBe(404);
  expect(runner).not.toHaveBeenCalled();
});
it('실패 상태의 브라우저 JSON을 데이터로 전달하지 않는다', async () => {
  const relay = createOliveyoungRelay('test', vi.fn().mockResolvedValue({ status: 'FAIL' }));
  expect((await relay(request())).status).toBe(502);
});
it('본문을 읽는 중인 요청도 슬롯 상한에 포함한다', async () => {
  const runner = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', runner);
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const pending = Array.from({ length: 8 }, () =>
    relay(
      new Request('http://localhost/v1/oliveyoung/stock-goods-info-v3', {
        method: 'POST',
        headers: { Authorization: 'Bearer test', ...consumerHeaders() },
        body: new ReadableStream({
          start(controller) {
            streams.push(controller);
          },
        }),
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    ),
  );
  expect((await relay(request())).status).toBe(503);
  for (const controller of streams) {
    controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
    controller.close();
  }
  expect((await Promise.all(pending)).every((response) => response.status === 200)).toBe(true);
  expect((await relay(request())).status).toBe(200);
});
it('공유 예산 거절·저장 오류에는 브라우저를 호출하지 않는다', async () => {
  const runner = vi.fn();
  const takeQuota = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('secret'));
  const relay = createOliveyoungRelay('test', runner, { takeQuota });
  expect((await relay(request())).status).toBe(429);
  expect((await relay(request())).status).toBe(503);
  expect(runner).not.toHaveBeenCalled();
});
it('인증된 상태 조회만 운영 통계를 반환한다', async () => {
  const relay = createOliveyoungRelay('test', vi.fn(), { status: () => ({ pages: 1 }) });
  expect((await relay(new Request('http://localhost/health'))).status).toBe(401);
  expect(
    await (
      await relay(
        new Request('http://localhost/health', { headers: { Authorization: 'Bearer test' } }),
      )
    ).json(),
  ).toMatchObject({ pages: 1, outstanding: 0 });
});
it('예산 허용 후 요청을 실행하고 잘못된 상태 경로는 거절한다', async () => {
  const runner = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', runner, {
    takeQuota: async () => true,
    status: () => ({ pages: 1 }),
  });
  expect((await relay(request())).status).toBe(200);
  for (const path of ['/health?x=1', '/other']) {
    expect(
      (
        await relay(
          new Request(`http://localhost${path}`, { headers: { Authorization: 'Bearer test' } }),
        )
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await createOliveyoungRelay(
        'test',
        runner,
      )(new Request('http://localhost/health', { headers: { Authorization: 'Bearer test' } }))
    ).status,
  ).toBe(404);
});
it('성공 응답을 캐시하고 캐시 조회는 예산을 사용하지 않는다', async () => {
  const runner = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const takeQuota = vi.fn().mockResolvedValue(true);
  const relay = createOliveyoungRelay('test', runner, { takeQuota });
  expect((await relay(request())).headers.get('x-relay-cache')).toBe('miss');
  expect((await relay(request())).headers.get('x-relay-cache')).toBe('hit');
  expect(takeQuota).toHaveBeenCalledTimes(1);
});
it('동일 요청을 병합하고 첫 요청 취소가 다른 대기자를 중단하지 않는다', async () => {
  let release!: (value: { status: string }) => void;
  const runner = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({ status: 'SUCCESS' });
  const events: unknown[] = [];
  const relay = createOliveyoungRelay('test', runner, {
    onEvent: (event) => {
      events.push(event);
    },
  });
  const first = relay(request(undefined, JSON.stringify({ goodsNo: 'other' })));
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const controller = new AbortController();
  const original = relay(
    new Request(request(), {
      signal: controller.signal,
      headers: { authorization: 'Bearer test', 'x-request-id': 'safe-id' },
    }),
  );
  await vi.waitFor(() =>
    expect(events).toContainEqual(
      expect.objectContaining({ requestId: 'safe-id', stage: 'cache' }),
    ),
  );
  const duplicate = relay(request());
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  release({ status: 'SUCCESS' });
  await first;
  expect((await original).status).toBe(503);
  expect(events).toContainEqual(expect.objectContaining({ stage: 'queue', outcome: 'canceled' }));
  expect((await duplicate).headers.get('x-relay-cache')).toBe('coalesced');
  expect(runner).toHaveBeenCalledTimes(2);
  expect(events).toContainEqual(
    expect.objectContaining({ requestId: 'safe-id', stage: 'cache', outcome: 'miss' }),
  );
});
it('만료된 대기는 실행하지 않고 실패한 응답을 캐시하지 않는다', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  let release!: (value: { status: string }) => void;
  const runner = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({ status: 'FAIL' });
  const relay = createOliveyoungRelay('test', runner, {
    onEvent: () => {
      throw new Error('logging');
    },
  });
  const first = relay(request());
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const queued = relay(request(undefined, JSON.stringify({ goodsNo: 'other' })));
  await new Promise((resolve) => setTimeout(resolve, 0));
  clock.mockReturnValue(41000);
  release({ status: 'SUCCESS' });
  await first;
  expect((await queued).status).toBe(503);
  expect(runner).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(641000);
  expect((await relay(request())).status).toBe(502);
  expect((await relay(request())).status).toBe(502);
  expect(runner).toHaveBeenCalledTimes(3);
  clock.mockRestore();
});
it('할당량 사유와 재시도 시간 및 상태를 반환한다', async () => {
  const status = {
    dailyRemaining: 0,
    minuteRemaining: 30,
    resetAt: { daily: 86400000, minute: 60000 },
    blockedBy: 'daily' as const,
    retryAfter: 99,
  };
  const takeQuota = Object.assign(async () => false, { status: () => status });
  const relay = createOliveyoungRelay('test', vi.fn(), { takeQuota, status: () => ({ pages: 0 }) });
  const response = await relay(
    new Request(request(), { headers: { authorization: 'Bearer test', 'x-request-id': 'bad.id' } }),
  );
  expect(response.headers.get('retry-after')).toBe('99');
  expect(response.headers.get('x-relay-quota-reason')).toBe('daily');
  const health = await relay(
    new Request('http://localhost/health', { headers: { authorization: 'Bearer test' } }),
  );
  expect(await health.json()).toMatchObject({ quota: status, cache: { entries: 0 } });
});
it('비동기 관측 실패도 요청 처리에 영향을 주지 않는다', async () => {
  const relay = createOliveyoungRelay('test', vi.fn().mockResolvedValue({ status: 'SUCCESS' }), {
    onEvent: async () => {
      throw new Error('observer');
    },
  });
  expect((await relay(request())).status).toBe(200);
});
it('40초 만료된 요청에 합류한 새 요청은 자기 대기 시간으로 실행한다', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  let release!: (value: { status: string }) => void;
  const runner = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({ status: 'SUCCESS' });
  const takeQuota = vi.fn().mockResolvedValue(true);
  const relay = createOliveyoungRelay('test', runner, { takeQuota });
  const first = relay(request(undefined, JSON.stringify({ goodsNo: 'block' })));
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const old = relay(request());
  await new Promise((resolve) => setTimeout(resolve, 0));
  clock.mockReturnValue(41000);
  const fresh = relay(request());
  await new Promise((resolve) => setTimeout(resolve, 0));
  release({ status: 'SUCCESS' });
  expect((await first).status).toBe(200);
  expect((await old).status).toBe(503);
  expect((await fresh).status).toBe(200);
  expect(runner).toHaveBeenCalledTimes(2);
  expect(takeQuota).toHaveBeenCalledTimes(2);
  clock.mockRestore();
});
it.each([
  [
    'product-search-v3',
    { includeSoldOut: true, keyword: 'x', page: 1, sort: 'x', size: 1 },
    300000,
  ],
  ['stock-goods-info-v3', { goodsNo: 'x' }, 600000],
  [
    'find-store',
    {
      lat: 1,
      lon: 1,
      pageIdx: 1,
      searchWords: '',
      pogKeys: '',
      serviceKeys: '',
      mapLat: 1,
      mapLon: 1,
    },
    300000,
  ],
  [
    'stock-stores',
    { productId: 'x', lat: 1, lon: 1, pageIdx: 1, searchWords: '', mapLat: 1, mapLon: 1 },
    60000,
  ],
])('%s TTL 경계까지 정규화된 입력을 재사용한다', async (operation, body, ttl) => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const runner = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', runner);
  await relay(request(operation, JSON.stringify(body)));
  clock.mockReturnValue(1000 + ttl - 1);
  const reversed = Object.fromEntries(Object.entries(body).reverse());
  expect(
    (await relay(request(operation, JSON.stringify(reversed)))).headers.get('x-relay-cache'),
  ).toBe('hit');
  clock.mockReturnValue(1000 + ttl);
  expect((await relay(request(operation, JSON.stringify(body)))).headers.get('x-relay-cache')).toBe(
    'miss',
  );
  expect(runner).toHaveBeenCalledTimes(2);
  clock.mockRestore();
});
it('공유 요청의 부모 ID와 실제 예산 소비를 기록한다', async () => {
  const events: unknown[] = [];
  let reject!: (reason: Error) => void;
  const runner = vi.fn().mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const relay = createOliveyoungRelay('test', runner, {
    takeQuota: async () => true,
    onEvent: (event) => {
      events.push(event);
    },
  });
  const first = relay(
    new Request(request(), {
      headers: { authorization: 'Bearer test', 'x-request-id': 'parent-id' },
    }),
  );
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const child = relay(request());
  await vi.waitFor(() =>
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'cache',
        outcome: 'coalesced',
        parentRequestId: 'parent-id',
      }),
    ),
  );
  expect(
    events.filter((event) => (event as { outcome: string }).outcome === 'consumed'),
  ).toHaveLength(1);
  reject(new Error('upstream'));
  expect((await first).status).toBe(502);
  expect((await child).status).toBe(502);
});

it('브라우저 교체 중 39999밀리초 기다린 작업은 실행하고 40초 대기는 만료로 기록한다', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(0);
  const events: unknown[] = [];
  let release!: (value: { status: string }) => void;
  const runner = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', runner, { onEvent: event => { events.push(event); } });
  const first = relay(request());
  await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  const expired = relay(request(undefined, JSON.stringify({ goodsNo: 'expired' })));
  await new Promise(resolve => setTimeout(resolve, 0));
  clock.mockReturnValue(1);
  const valid = relay(request(undefined, JSON.stringify({ goodsNo: 'valid' })));
  await new Promise(resolve => setTimeout(resolve, 0));
  clock.mockReturnValue(40000);
  release({ status: 'SUCCESS' });
  expect((await first).status).toBe(200);
  expect((await expired).status).toBe(503);
  expect((await valid).status).toBe(200);
  expect(events).toContainEqual(expect.objectContaining({ stage: 'queue', outcome: 'expired' }));
  expect(runner).toHaveBeenCalledTimes(2);
  clock.mockRestore();
});
