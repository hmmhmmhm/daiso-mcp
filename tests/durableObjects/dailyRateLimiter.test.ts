import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_RATE_LIMIT,
  DailyRateLimiter,
  nextKstMidnightEpochSeconds,
  toKstDay,
} from '../../src/durableObjects/dailyRateLimiter.js';

interface StoredCounter {
  day: string;
  count: number;
}

function createState(initial?: StoredCounter) {
  const values = new Map<string, unknown>();
  if (initial) {
    values.set('counter', initial);
  }

  const get = vi.fn(async (key: string) => values.get(key));
  const put = vi.fn(async (key: string, value: unknown) => {
    values.set(key, value);
  });

  return {
    state: {
      storage: { get, put },
    } as unknown as DurableObjectState,
    get,
    put,
    values,
  };
}

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

  it('fetch는 현재 시각 기준 소비 결과를 JSON으로 반환한다', async () => {
    const fixture = createState();
    const limiter = new DailyRateLimiter(fixture.state);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T00:00:00Z'));

    const response = await limiter.fetch();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ allowed: true, count: 1, day: '2026-07-17' });
    nowSpy.mockRestore();
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
