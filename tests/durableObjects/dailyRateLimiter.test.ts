import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DAILY_RATE_LIMIT,
  DailyRateLimiter,
  nextKstMidnightEpochSeconds,
  toKstDay,
} from '../../src/durableObjects/dailyRateLimiter.js';
import {
  RateLimitMetricsStore,
  type BlockedRateLimitEvent,
} from '../../src/durableObjects/rateLimitMetricsStore.js';
import { createRateLimitSqlState } from '../helpers/rateLimitSqlStorage.js';

interface StoredCounter {
  day: string;
  count: number;
}

const VALID_IDENTITY_ID = '0123456789abcdef'.repeat(4);
const VALID_EVENT: BlockedRateLimitEvent = {
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  occurredAt: Date.parse('2026-07-22T03:00:00+09:00'),
  day: '2026-07-22',
  service: 'cgv',
  identityId: VALID_IDENTITY_ID,
};

function createState(initial?: StoredCounter) {
  const metrics = createRateLimitSqlState();
  const values = new Map<string, unknown>();
  if (initial) {
    values.set('counter', initial);
  }

  const get = vi.fn(async (key: string) => values.get(key));
  const put = vi.fn(async (key: string, value: unknown) => {
    values.set(key, value);
  });
  Object.assign(metrics.state.storage, { get, put });

  return {
    ...metrics,
    get,
    put,
    values,
  };
}

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://호스트는-라우팅에-쓰지-않음.example${path}`, init);
}

function eventBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...VALID_EVENT, ...overrides });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DailyRateLimiter', () => {
  it('3,000번째 요청은 허용하고 다음 요청부터 저장 횟수 증가 없이 거부한다', async () => {
    const fixture = createState({ day: '2026-07-17', count: DAILY_RATE_LIMIT - 1 });
    const limiter = new DailyRateLimiter(fixture.state);
    const nowMs = Date.parse('2026-07-17T14:59:59Z');

    const allowed = await limiter.consume(nowMs);
    const denied = await limiter.consume(nowMs);

    expect(allowed).toEqual({
      allowed: true,
      count: DAILY_RATE_LIMIT,
      remaining: 0,
      resetAt: Date.parse('2026-07-17T15:00:00Z') / 1000,
      day: '2026-07-17',
    });
    expect(denied).toEqual({ ...allowed, allowed: false });
    expect(fixture.put).toHaveBeenCalledTimes(1);
    expect(fixture.values.get('counter')).toEqual({ day: '2026-07-17', count: DAILY_RATE_LIMIT });
  });

  it('KST 자정이 지나면 이전 날짜 카운터를 1로 초기화한다', async () => {
    const fixture = createState({ day: '2026-07-17', count: DAILY_RATE_LIMIT });
    const limiter = new DailyRateLimiter(fixture.state);

    const result = await limiter.consume(Date.parse('2026-07-17T15:00:00Z'));

    expect(result).toEqual({
      allowed: true,
      count: 1,
      remaining: DAILY_RATE_LIMIT - 1,
      resetAt: Date.parse('2026-07-18T15:00:00Z') / 1000,
      day: '2026-07-18',
    });
    expect(fixture.values.get('counter')).toEqual({ day: '2026-07-18', count: 1 });
  });

  it('저장된 값이 없으면 첫 요청을 허용한다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);

    const result = await limiter.consume(Date.parse('2026-01-01T00:00:00Z'));

    expect(result.count).toBe(1);
    expect(result.remaining).toBe(DAILY_RATE_LIMIT - 1);
    expect(fixture.get).toHaveBeenCalledWith('counter');
  });

  it('POST /consume은 현재 시각 기준 소비 결과를 JSON으로 반환하고 원장 저장소를 만들지 않는다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T00:00:00Z'));

    const response = await limiter.fetch(request('/consume', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ allowed: true, count: 1, day: '2026-07-17' });
    expect(fixture.sql.executed).toHaveLength(0);
    nowSpy.mockRestore();
  });

  it('POST /blocked-events는 완전한 이벤트 저장이 끝난 뒤 빈 204를 반환한다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    const response = await limiter.fetch(
      request('/blocked-events', { method: 'POST', body: eventBody() }),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(fixture.readEvents()).toEqual([VALID_EVENT]);
  });

  it('POST /blocked-events는 record 완료 전에는 응답을 확정하지 않는다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    let finishRecord: (() => void) | undefined;
    const record = vi.spyOn(RateLimitMetricsStore.prototype, 'record').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRecord = resolve;
        }),
    );
    let settled = false;

    const responsePromise = limiter
      .fetch(request('/blocked-events', { method: 'POST', body: eventBody() }))
      .finally(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());

    expect(settled).toBe(false);
    finishRecord?.();
    await expect(responsePromise).resolves.toMatchObject({ status: 204 });
  });

  it.each([
    ['깨진 JSON', '{"eventId":'],
    ['null', 'null'],
    ['배열', '[]'],
    ['문자열', '"event"'],
    ['필드 누락', JSON.stringify({ eventId: VALID_EVENT.eventId })],
    ['알 수 없는 필드', eventBody({ rawIp: '203.0.113.10' })],
    ['UUID가 아닌 eventId', eventBody({ eventId: 'event-1' })],
    ['무한대 occurredAt', eventBody().replace(String(VALID_EVENT.occurredAt), '1e400')],
    ['음수 occurredAt', eventBody({ occurredAt: -1 })],
    ['소수 occurredAt', eventBody({ occurredAt: VALID_EVENT.occurredAt + 0.5 })],
    ['KST 계산 범위를 벗어난 occurredAt', eventBody({ occurredAt: 8_640_000_000_000_000 })],
    ['정확하지 않은 날짜 형식', eventBody({ day: '2026-7-22' })],
    ['존재하지 않는 날짜', eventBody({ day: '2026-02-30' })],
    ['KST 발생일과 다른 날짜', eventBody({ day: '2026-07-21' })],
    ['지원하지 않는 서비스', eventBody({ service: 'megabox' })],
    ['빈 identityId', eventBody({ identityId: '  ' })],
    ['원본 IP identityId', eventBody({ identityId: '203.0.113.10' })],
    ['대문자 64자 identityId', eventBody({ identityId: 'A'.repeat(64) })],
  ])('%s 이벤트는 400을 반환하고 기록하거나 본문을 로그하지 않는다', async (_, body) => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    const record = vi.spyOn(RateLimitMetricsStore.prototype, 'record');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await limiter.fetch(request('/blocked-events', { method: 'POST', body }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(record).not.toHaveBeenCalled();
    expect(fixture.sql.executed).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('GET /stats는 날짜와 서비스 필터를 파싱해 집계 JSON을 반환한다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-22T03:00:00+09:00'));
    const fixture = createState();
    const setupStore = new RateLimitMetricsStore(fixture.state);
    await setupStore.record(VALID_EVENT);
    const query = vi.spyOn(RateLimitMetricsStore.prototype, 'query');
    const limiter = new DailyRateLimiter(fixture.state);

    const response = await limiter.fetch(
      request('/stats?service=cgv&to=2026-07-22&from=2026-07-22'),
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith({ from: '2026-07-22', to: '2026-07-22', service: 'cgv' });
    expect(await response.json()).toEqual({
      totals: { blockedRequests: 1, uniqueIdentities: 1 },
      daily: [{ day: '2026-07-22', blockedRequests: 1, uniqueIdentities: 1 }],
      services: [
        {
          day: '2026-07-22',
          service: 'cgv',
          blockedRequests: 1,
          uniqueIdentities: 1,
        },
      ],
    });
  });

  it('GET /stats는 생략된 서비스 필터를 저장소에 전달하지 않는다', async () => {
    const fixture = createState();
    const query = vi.spyOn(RateLimitMetricsStore.prototype, 'query');
    const limiter = new DailyRateLimiter(fixture.state);

    const response = await limiter.fetch(request('/stats?from=2026-07-21&to=2026-07-22'));

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith({ from: '2026-07-21', to: '2026-07-22' });
  });

  it('같은 인스턴스는 계측 저장소를 재사용하고 다른 인스턴스와 상태를 공유하지 않는다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-22T03:00:00+09:00'));
    const first = createState();
    const firstLimiter = new DailyRateLimiter(first.state);

    await firstLimiter.fetch(request('/blocked-events', { method: 'POST', body: eventBody() }));
    await firstLimiter.fetch(request('/stats?from=2026-07-22&to=2026-07-22'));
    await firstLimiter.alarm();

    const second = createState();
    const secondLimiter = new DailyRateLimiter(second.state);
    await secondLimiter.fetch(request('/stats?from=2026-07-22&to=2026-07-22'));

    expect(first.sql.executed.filter(({ query }) => query.startsWith('CREATE'))).toHaveLength(4);
    expect(second.sql.executed.filter(({ query }) => query.startsWith('CREATE'))).toHaveLength(4);
    expect(first.readEvents()).toEqual([VALID_EVENT]);
    expect(second.readEvents()).toHaveLength(0);
  });

  it.each([
    ['from 누락', '/stats?to=2026-07-22'],
    ['to 누락', '/stats?from=2026-07-22'],
    ['정확하지 않은 from', '/stats?from=2026-7-21&to=2026-07-22'],
    ['존재하지 않는 to', '/stats?from=2026-02-01&to=2026-02-30'],
    ['역전된 기간', '/stats?from=2026-07-23&to=2026-07-22'],
    ['빈 서비스', '/stats?from=2026-07-21&to=2026-07-22&service='],
    ['지원하지 않는 서비스', '/stats?from=2026-07-21&to=2026-07-22&service=daiso'],
    ['중복 from', '/stats?from=2026-07-21&from=2026-07-22&to=2026-07-22'],
    ['중복 to', '/stats?from=2026-07-21&to=2026-07-21&to=2026-07-22'],
    ['중복 서비스', '/stats?from=2026-07-21&to=2026-07-22&service=cgv&service=gs25'],
    ['알 수 없는 키', '/stats?from=2026-07-21&to=2026-07-22&identityId=opaque'],
  ])('%s 통계 요청은 400을 반환하고 조회하지 않는다', async (_, path) => {
    const fixture = createState();
    const query = vi.spyOn(RateLimitMetricsStore.prototype, 'query');
    const limiter = new DailyRateLimiter(fixture.state);

    const response = await limiter.fetch(request(path));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['GET /consume', '/consume', { method: 'GET' }],
    ['GET /blocked-events', '/blocked-events', { method: 'GET' }],
    ['POST /stats', '/stats?from=2026-07-21&to=2026-07-22', { method: 'POST' }],
    ['알 수 없는 경로', '/unknown', { method: 'POST' }],
  ])('%s는 일관된 JSON 404를 반환한다', async (_, path, init) => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);

    const response = await limiter.fetch(request(path, init));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: '요청한 작업을 찾을 수 없습니다.' });
    expect(fixture.sql.executed).toHaveLength(0);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('원장 기록 실패를 성공 응답으로 바꾸지 않는다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    vi.spyOn(RateLimitMetricsStore.prototype, 'record').mockRejectedValueOnce(
      new Error('ledger unavailable'),
    );

    await expect(
      limiter.fetch(request('/blocked-events', { method: 'POST', body: eventBody() })),
    ).rejects.toThrow('ledger unavailable');
  });

  it('통계 조회 실패를 0 집계로 바꾸지 않는다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    vi.spyOn(RateLimitMetricsStore.prototype, 'query').mockRejectedValueOnce(
      new Error('query unavailable'),
    );

    await expect(limiter.fetch(request('/stats?from=2026-07-21&to=2026-07-22'))).rejects.toThrow(
      'query unavailable',
    );
  });

  it('alarm은 cleanup 성공 후 ensureAlarm을 호출한다', async () => {
    const fixture = createState();
    const cleanup = vi.spyOn(RateLimitMetricsStore.prototype, 'cleanup').mockResolvedValue();
    const ensureAlarm = vi
      .spyOn(RateLimitMetricsStore.prototype, 'ensureAlarm')
      .mockResolvedValue();
    const limiter = new DailyRateLimiter(fixture.state);

    await limiter.alarm();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(ensureAlarm).toHaveBeenCalledOnce();
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      ensureAlarm.mock.invocationCallOrder[0],
    );
  });

  it('alarm cleanup 실패를 전파하고 다음 alarm을 예약하지 않는다', async () => {
    const fixture = createState();
    const cleanup = vi
      .spyOn(RateLimitMetricsStore.prototype, 'cleanup')
      .mockRejectedValueOnce(new Error('cleanup unavailable'));
    const ensureAlarm = vi.spyOn(RateLimitMetricsStore.prototype, 'ensureAlarm');
    const limiter = new DailyRateLimiter(fixture.state);

    await expect(limiter.alarm()).rejects.toThrow('cleanup unavailable');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(ensureAlarm).not.toHaveBeenCalled();
  });

  it('alarm 예약 실패를 전파해 플랫폼 재시도를 허용한다', async () => {
    const fixture = createState();
    const cleanup = vi.spyOn(RateLimitMetricsStore.prototype, 'cleanup').mockResolvedValue();
    const ensureAlarm = vi
      .spyOn(RateLimitMetricsStore.prototype, 'ensureAlarm')
      .mockRejectedValueOnce(new Error('alarm unavailable'));
    const limiter = new DailyRateLimiter(fixture.state);

    await expect(limiter.alarm()).rejects.toThrow('alarm unavailable');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(ensureAlarm).toHaveBeenCalledOnce();
  });
});

describe('KST 일자 계산', () => {
  it('UTC 15시를 KST 날짜 경계로 계산한다', () => {
    expect(toKstDay(Date.parse('2026-07-17T14:59:59Z'))).toBe('2026-07-17');
    expect(toKstDay(Date.parse('2026-07-17T15:00:00Z'))).toBe('2026-07-18');
  });

  it('다음 KST 자정의 Unix timestamp를 반환한다', () => {
    expect(nextKstMidnightEpochSeconds(Date.parse('2026-07-17T14:59:59Z'))).toBe(
      Date.parse('2026-07-17T15:00:00Z') / 1000,
    );
  });
});
