import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const FIRST_QUOTA_ID = '1'.repeat(64);
const NOW_MS = Date.parse('2026-07-17T00:00:00.000Z');

type QuotaOutcome = DailyRateLimitResult | Error | (() => Response);

function createDurableObjectId(value: string): DurableObjectId {
  return { toString: () => value } as unknown as DurableObjectId;
}

function createRateLimitEnv(outcome: QuotaOutcome = allowedResult) {
  const quotaIds = new Map<string, DurableObjectId>();
  const requests: Request[] = [];
  const stubFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return typeof outcome === 'function' ? outcome() : Response.json(outcome);
  });
  const get = vi.fn(() => ({ fetch: stubFetch }));
  const idFromName = vi.fn((name: string) => {
    let id = quotaIds.get(name);
    if (!id) {
      id = createDurableObjectId(
        (FIRST_QUOTA_ID.slice(0, -1) + (quotaIds.size + 1).toString(16)).padStart(64, '0'),
      );
      quotaIds.set(name, id);
    }
    return id;
  });
  const env: AppBindings = {
    DAILY_RATE_LIMITER: { get, idFromName } as unknown as DurableObjectNamespace,
  };

  return { env, idFromName, get, stubFetch, requests };
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
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
    '/api/cgvish/timetable',
    '/api/cuish/stores',
    '/api/gs250/products',
    '/api/lottemartish/products',
    '/api/cgv',
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
    expect(fixture.get.mock.calls[0]?.[0].toString()).toBe(FIRST_QUOTA_ID);
    expect(fixture.stubFetch).toHaveBeenCalledWith('https://daily-rate-limit/consume', {
      method: 'POST',
    });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]?.method).toBe('POST');
    expect(new URL(fixture.requests[0]?.url ?? '').pathname).toBe('/consume');
  });

  it('교차 존 Worker 요청을 upstream zone별 객체로 분리한다', async () => {
    const fixture = createRateLimitEnv();
    const firstZone = new Request('https://example.com/api/cgv/timetable', {
      headers: {
        'CF-Connecting-IP': '2a06:98c0:3600::103',
        'CF-Worker': 'first.example',
      },
    });
    const secondZone = new Request('https://example.com/api/cgv/timetable', {
      headers: {
        'CF-Connecting-IP': '2a06:98c0:3600::103',
        'CF-Worker': 'second.example',
      },
    });

    await consumeDailyRateLimit(firstZone, fixture.env);
    await consumeDailyRateLimit(secondZone, fixture.env);

    expect(fixture.idFromName.mock.calls[0][0]).toBe(
      await hashRateLimitIdentity('worker-zone:first.example'),
    );
    expect(fixture.idFromName.mock.calls[1][0]).toBe(
      await hashRateLimitIdentity('worker-zone:second.example'),
    );
    expect(fixture.idFromName.mock.calls[0][0]).not.toBe(fixture.idFromName.mock.calls[1][0]);
  });

  it('교차 존 Worker 이름을 공백 제거와 소문자로 정규화한다', async () => {
    const fixture = createRateLimitEnv();
    const request = new Request('https://example.com/api/cgv/timetable', {
      headers: {
        'CF-Connecting-IP': '2a06:98c0:3600::103',
        'CF-Worker': '  Example.COM  ',
      },
    });

    await consumeDailyRateLimit(request, fixture.env);

    expect(fixture.idFromName).toHaveBeenCalledWith(
      await hashRateLimitIdentity('worker-zone:example.com'),
    );
  });

  it('일반 IP는 CF-Worker 헤더가 있어도 기존 IP 객체를 사용한다', async () => {
    const fixture = createRateLimitEnv();
    const request = new Request('https://example.com/api/cgv/timetable', {
      headers: {
        'CF-Connecting-IP': '203.0.113.10',
        'CF-Worker': 'spoofed.example',
      },
    });

    await consumeDailyRateLimit(request, fixture.env);

    expect(fixture.idFromName).toHaveBeenCalledWith(await hashRateLimitIdentity('203.0.113.10'));
  });

  it('교차 존 특수 IP에 CF-Worker가 없으면 기존 공유 객체를 사용한다', async () => {
    const fixture = createRateLimitEnv();
    const request = new Request('https://example.com/api/cgv/timetable', {
      headers: { 'CF-Connecting-IP': '2a06:98c0:3600::103' },
    });

    await consumeDailyRateLimit(request, fixture.env);

    expect(fixture.idFromName).toHaveBeenCalledWith(
      await hashRateLimitIdentity('2a06:98c0:3600::103'),
    );
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
      await consumeDailyRateLimit(
        new Request('https://example.com/api/cgv/timetable'),
        fixture.env,
      ),
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
    const badResponseFixture = createRateLimitEnv(() => new Response('bad', { status: 503 }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('https://example.com/api/cgv/timetable', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });

    expect(await consumeDailyRateLimit(request, errorFixture.env)).toBeNull();
    expect(await consumeDailyRateLimit(request, badResponseFixture.env)).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('temporary failure');
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('203.0.113.10');
  });

  it('본문이 잘못된 성공 응답이나 Error가 아닌 예외도 민감정보 없이 fail-open한다', async () => {
    const malformedFixture = createRateLimitEnv(() => new Response('not-json'));
    const thrownFixture = createRateLimitEnv();
    thrownFixture.stubFetch.mockRejectedValueOnce('failed 203.0.113.10');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('https://example.com/api/cgv/timetable', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });

    const malformedResult = await consumeDailyRateLimit(request, malformedFixture.env);
    const thrownResult = await consumeDailyRateLimit(request, thrownFixture.env);

    expect(malformedResult).toBeNull();
    expect(thrownResult).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    const logged = JSON.stringify(consoleSpy.mock.calls);
    expect(logged).not.toContain('failed 203.0.113.10');
    expect(logged).not.toContain('203.0.113.10');
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
