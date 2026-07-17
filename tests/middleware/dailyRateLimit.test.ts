import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeDailyRateLimit,
  hashRateLimitIdentity,
  isDailyRateLimitedRequest,
  setRateLimitHeaders,
} from '../../src/middleware/dailyRateLimit.js';
import type { AppBindings } from '../../src/api/response.js';
import type { DailyRateLimitResult } from '../../src/durableObjects/dailyRateLimiter.js';

const allowedResult: DailyRateLimitResult = {
  allowed: true,
  count: 1,
  remaining: 2999,
  resetAt: 1784296800,
  day: '2026-07-17',
};

function createRateLimitEnv(response: Response | Error = Response.json(allowedResult)) {
  const stubFetch = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  const get = vi.fn(() => ({ fetch: stubFetch }));
  const idFromName = vi.fn((name: string) => ({ name }) as unknown as DurableObjectId);
  const env: AppBindings = {
    DAILY_RATE_LIMITER: { get, idFromName } as unknown as DurableObjectNamespace,
  };

  return { env, idFromName, get, stubFetch };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isDailyRateLimitedRequest', () => {
  it.each([
    '/api/oliveyoung/products',
    '/api/cgv/timetable',
    '/api/cu/stores',
    '/api/gs25/products',
    '/api/lottemart/products',
  ])('%s GET을 보호한다', (path) => {
    expect(isDailyRateLimitedRequest(new Request(`https://example.com${path}`))).toBe(true);
  });

  it.each([
    '/health',
    '/api/health/checks',
    '/mcp',
    '/',
    '/api/daiso/products',
    '/api/oliveyoungness/products',
  ])('%s 경로를 제외한다', (path) => {
    expect(isDailyRateLimitedRequest(new Request(`https://example.com${path}`))).toBe(false);
  });

  it('GET 이외의 메서드를 제외한다', () => {
    expect(
      isDailyRateLimitedRequest(
        new Request('https://example.com/api/cgv/timetable', {
          method: 'PUT',
        }),
      ),
    ).toBe(false);
  });
});

describe('consumeDailyRateLimit', () => {
  it('원본 IP 대신 SHA-256 해시로 Durable Object를 호출한다', async () => {
    const fixture = createRateLimitEnv();
    const request = new Request('https://example.com/api/oliveyoung/products', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });

    const result = await consumeDailyRateLimit(request, fixture.env);

    expect(result).toEqual(allowedResult);
    expect(fixture.idFromName).toHaveBeenCalledWith(await hashRateLimitIdentity('203.0.113.10'));
    expect(fixture.idFromName).not.toHaveBeenCalledWith('203.0.113.10');
    expect(fixture.stubFetch).toHaveBeenCalledWith('https://daily-rate-limit/consume', { method: 'POST' });
  });

  it('같은 IP는 서비스가 달라도 같은 객체를 사용하고 다른 IP는 분리한다', async () => {
    const fixture = createRateLimitEnv();

    await consumeDailyRateLimit(
      new Request('https://example.com/api/cgv/timetable', {
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      }),
      fixture.env,
    );
    await consumeDailyRateLimit(
      new Request('https://example.com/api/gs25/products', {
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      }),
      fixture.env,
    );
    await consumeDailyRateLimit(
      new Request('https://example.com/api/gs25/products', {
        headers: { 'CF-Connecting-IP': '203.0.113.11' },
      }),
      fixture.env,
    );

    expect(fixture.idFromName.mock.calls[0][0]).toBe(fixture.idFromName.mock.calls[1][0]);
    expect(fixture.idFromName.mock.calls[2][0]).not.toBe(fixture.idFromName.mock.calls[0][0]);
  });

  it('보호 대상이 아니거나 binding과 IP가 없으면 제한을 건너뛴다', async () => {
    const fixture = createRateLimitEnv();

    expect(
      await consumeDailyRateLimit(
        new Request('https://example.com/api/daiso/products', {
          headers: { 'CF-Connecting-IP': '203.0.113.10' },
        }),
        fixture.env,
      ),
    ).toBeNull();
    expect(
      await consumeDailyRateLimit(new Request('https://example.com/api/cgv/timetable'), fixture.env),
    ).toBeNull();
    expect(
      await consumeDailyRateLimit(
        new Request('https://example.com/api/cgv/timetable', {
          headers: { 'CF-Connecting-IP': '203.0.113.10' },
        }),
        {},
      ),
    ).toBeNull();
    expect(
      await consumeDailyRateLimit(
        new Request('https://example.com/api/cgv/timetable', {
          headers: { 'CF-Connecting-IP': '203.0.113.10' },
        }),
        undefined,
      ),
    ).toBeNull();
    expect(fixture.idFromName).not.toHaveBeenCalled();
  });

  it('일치하는 헬스 체크 secret만 제한을 우회한다', async () => {
    const fixture = createRateLimitEnv();
    fixture.env.HEALTH_CHECK_SECRET = 'health-secret';

    const valid = new Request('https://example.com/api/cgv/timetable', {
      headers: {
        'CF-Connecting-IP': '203.0.113.10',
        'x-health-check-key': 'health-secret',
      },
    });
    const invalid = new Request('https://example.com/api/cgv/timetable', {
      headers: {
        'CF-Connecting-IP': '203.0.113.10',
        'x-health-check-key': 'wrong-secret',
      },
    });

    expect(await consumeDailyRateLimit(valid, fixture.env)).toBeNull();
    expect(await consumeDailyRateLimit(invalid, fixture.env)).toEqual(allowedResult);
    expect(fixture.idFromName).toHaveBeenCalledTimes(1);
  });

  it('Durable Object 오류나 비정상 응답이면 fail-open한다', async () => {
    const errorFixture = createRateLimitEnv(new Error('temporary failure'));
    const badResponseFixture = createRateLimitEnv(new Response('bad', { status: 503 }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('https://example.com/api/cgv/timetable', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });

    expect(await consumeDailyRateLimit(request, errorFixture.env)).toBeNull();
    expect(await consumeDailyRateLimit(request, badResponseFixture.env)).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('일일 호출 제한 확인 실패', 'temporary failure');
  });

  it('Error가 아닌 예외도 민감정보 없이 기록하고 fail-open한다', async () => {
    const fixture = createRateLimitEnv();
    fixture.stubFetch.mockRejectedValueOnce('failed');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await consumeDailyRateLimit(
      new Request('https://example.com/api/cgv/timetable', {
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      }),
      fixture.env,
    );

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('일일 호출 제한 확인 실패', 'failed');
  });
});

describe('setRateLimitHeaders', () => {
  it('제한량과 남은 횟수 및 초기화 시각을 추가한다', () => {
    const headers = new Headers();

    setRateLimitHeaders(headers, allowedResult);

    expect(headers.get('X-RateLimit-Limit')).toBe('3000');
    expect(headers.get('X-RateLimit-Remaining')).toBe('2999');
    expect(headers.get('X-RateLimit-Reset')).toBe(String(allowedResult.resetAt));
  });
});
