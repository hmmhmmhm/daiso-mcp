import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import type { AppBindings } from '../../src/api/response.js';
import type { DailyRateLimitResult } from '../../src/durableObjects/dailyRateLimiter.js';

const originalCaches = (globalThis as { caches?: CacheStorage }).caches;

function createResult(overrides: Partial<DailyRateLimitResult> = {}): DailyRateLimitResult {
  return {
    allowed: true,
    count: 1,
    remaining: 2999,
    resetAt: Math.floor(Date.now() / 1000) + 3600,
    day: '2026-07-17',
    ...overrides,
  };
}

function createRateLimitEnv(results: DailyRateLimitResult[], additional: Partial<AppBindings> = {}) {
  const queue = [...results];
  const stubFetch = vi.fn(async () => Response.json(queue.shift() ?? createResult()));
  const get = vi.fn(() => ({ fetch: stubFetch }));
  const idFromName = vi.fn((name: string) => ({ name }) as unknown as DurableObjectId);
  const env: AppBindings = {
    DAILY_RATE_LIMITER: { get, idFromName } as unknown as DurableObjectNamespace,
    ...additional,
  };

  return { env, idFromName, get, stubFetch };
}

afterEach(() => {
  (globalThis as { caches?: CacheStorage }).caches = originalCaches;
  vi.restoreAllMocks();
});

describe('일일 호출 제한 통합', () => {
  it('허용 요청의 기존 응답에 rate limit 헤더를 추가한다', async () => {
    const fixture = createRateLimitEnv([createResult()]);

    const response = await app.request(
      '/api/oliveyoung/products',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('3000');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('2999');
    expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    expect(fixture.stubFetch).toHaveBeenCalledTimes(1);
  });

  it('한도 초과 요청은 handler 호출 전에 429와 초기화 헤더를 반환한다', async () => {
    const denied = createResult({ allowed: false, count: 3000, remaining: 0 });
    const fixture = createRateLimitEnv([denied]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await app.request(
      '/api/cgv/timetable?playDate=20260717&theaterCode=0056',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect((await response.json()).error.code).toBe('DAILY_RATE_LIMIT_EXCEEDED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('edge cache hit 응답도 호출량을 계산한다', async () => {
    const fixture = createRateLimitEnv([createResult({ count: 2, remaining: 2998 })]);
    const cachedResponse = new Response(JSON.stringify({ success: true, data: { products: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const match = vi.fn().mockResolvedValue(cachedResponse);
    const put = vi.fn();
    (globalThis as { caches?: CacheStorage }).caches = {
      default: { match, put } as unknown as Cache,
    } as CacheStorage;

    const response = await app.request(
      '/api/oliveyoung/products?keyword=립밤',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('2998');
    expect(fixture.stubFetch).toHaveBeenCalledTimes(1);
    expect(match).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });

  it('헬스 체크와 MCP 스트림·세션 경로는 binding을 호출하지 않는다', async () => {
    const fixture = createRateLimitEnv([], { HEALTH_CHECK_SECRET: 'health-secret' });
    const ipHeaders = { 'CF-Connecting-IP': '203.0.113.10' };

    const health = await app.request('/health', { headers: ipHeaders }, fixture.env);
    const detailedHealth = await app.request(
      '/api/health/checks',
      {
        headers: {
          ...ipHeaders,
          Authorization: 'Bearer health-secret',
          'User-Agent': 'nginx-ssl early hints',
        },
      },
      fixture.env,
    );
    const stream = await app.request('/mcp', { headers: ipHeaders }, fixture.env);

    expect(health.status).toBe(200);
    expect(detailedHealth.status).toBe(204);
    expect(stream.status).toBe(400);
    expect(health.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(detailedHealth.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(stream.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(fixture.idFromName).not.toHaveBeenCalled();
  });

  it('GET 이외의 보호 경로 요청은 호출량을 계산하지 않는다', async () => {
    const fixture = createRateLimitEnv([]);

    const response = await app.request(
      '/api/cgv/timetable',
      {
        method: 'PUT',
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      },
      fixture.env,
    );

    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(fixture.idFromName).not.toHaveBeenCalled();
  });

  it('유효한 내부 헬스 체크 secret은 보호 경로에서도 제한을 우회한다', async () => {
    const fixture = createRateLimitEnv([], { HEALTH_CHECK_SECRET: 'health-secret' });

    const response = await app.request(
      '/api/oliveyoung/products',
      {
        headers: {
          'CF-Connecting-IP': '203.0.113.10',
          'x-health-check-key': 'health-secret',
        },
      },
      fixture.env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(fixture.idFromName).not.toHaveBeenCalled();
  });
});
