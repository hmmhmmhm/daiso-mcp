import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { nextKstMidnightEpochSeconds } from '../../src/durableObjects/dailyRateLimiter.js';
import { RATE_LIMIT_METRICS_LEDGER_NAME } from '../../src/durableObjects/rateLimitMetricsStore.js';
import { hashRateLimitIdentity } from '../../src/middleware/dailyRateLimit.js';
import {
  callPaths,
  createRateLimitEnv,
  createResult,
  EVENT_ID,
  KST_ROLLOVER_AFTER_MS,
  KST_ROLLOVER_BEFORE_MS,
  LEDGER_ID,
  MALFORMED_QUOTA_RESULTS,
  NOW_MS,
  ORIGINAL_CACHES,
  QUOTA_ID,
  RATE_LIMIT_DAY,
} from '../helpers/dailyRateLimitFixture.js';

afterEach(() => {
  (globalThis as { caches?: CacheStorage }).caches = ORIGINAL_CACHES;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
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
    expect(callPaths(fixture.calls)).toEqual(['/consume']);
  });

  it.each(MALFORMED_QUOTA_RESULTS)(
    'HTTP 200 %s quota JSON은 기록이나 제한 헤더 없이 fail-open한다',
    async (_, malformedResult) => {
      const fixture = createRateLimitEnv([malformedResult]);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await app.request(
        '/api/oliveyoung/products',
        { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
        fixture.env,
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).not.toBe('DAILY_RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeNull();
      expect(response.headers.get('X-RateLimit-Reset')).toBeNull();
      expect(response.headers.get('Retry-After')).toBeNull();
      expect(callPaths(fixture.calls)).toEqual(['/consume']);
      expect(fixture.idFromName).not.toHaveBeenCalledWith(RATE_LIMIT_METRICS_LEDGER_NAME);
      expect(consoleSpy).toHaveBeenCalledWith('일일 호출 제한 응답 검증 실패');
      expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('203.0.113.10');
    },
  );

  it('3,000번째 허용 응답은 remaining 0인 정상 결과로 처리한다', async () => {
    const fixture = createRateLimitEnv([
      createResult({ allowed: true, count: 3000, remaining: 0 }),
    ]);

    const response = await app.request(
      '/api/oliveyoung/products',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(callPaths(fixture.calls)).toEqual(['/consume']);
  });

  it.each([
    ['허용', createResult()],
    ['거부', createResult({ allowed: false, count: 3000, remaining: 0 })],
  ] as const)('quota 응답 직후 KST 일자가 바뀐 %s 결정은 fail-open한다', async (_, result) => {
    const nowSpy = vi.mocked(Date.now);
    nowSpy.mockReturnValue(KST_ROLLOVER_BEFORE_MS);
    const fixture = createRateLimitEnv([result], {}, 204, () => {
      nowSpy.mockReturnValue(KST_ROLLOVER_AFTER_MS);
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await app.request(
      '/api/oliveyoung/products',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).not.toBe('DAILY_RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeNull();
    expect(response.headers.get('X-RateLimit-Reset')).toBeNull();
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(callPaths(fixture.calls)).toEqual(['/consume']);
    expect(fixture.idFromName).not.toHaveBeenCalledWith(RATE_LIMIT_METRICS_LEDGER_NAME);
    expect(consoleSpy).toHaveBeenCalledWith('일일 호출 제한 날짜 전환 감지');
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('203.0.113.10');
  });

  it.each([
    ['stale', Math.floor(NOW_MS / 1000) - 1],
    ['future', nextKstMidnightEpochSeconds(NOW_MS) + 1],
  ] as const)('정확한 다음 KST 자정이 아닌 %s resetAt은 fail-open한다', async (_, resetAt) => {
    const denied = createResult({ allowed: false, count: 3000, remaining: 0, resetAt });
    const fixture = createRateLimitEnv([denied]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await app.request(
      '/api/oliveyoung/products',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).not.toBe('DAILY_RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeNull();
    expect(response.headers.get('X-RateLimit-Reset')).toBeNull();
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(callPaths(fixture.calls)).toEqual(['/consume']);
    expect(fixture.idFromName).not.toHaveBeenCalledWith(RATE_LIMIT_METRICS_LEDGER_NAME);
    expect(consoleSpy).toHaveBeenCalledWith('일일 호출 제한 초기화 시각 검증 실패');
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('203.0.113.10');
  });

  it.each([
    ['KST 자정 직전', KST_ROLLOVER_BEFORE_MS, RATE_LIMIT_DAY],
    ['KST 자정 경계', KST_ROLLOVER_AFTER_MS, '2026-07-23'],
  ] as const)('%s의 정확한 다음 자정 resetAt을 허용한다', async (_, nowMs, day) => {
    vi.mocked(Date.now).mockReturnValue(nowMs);
    const resetAt = nextKstMidnightEpochSeconds(nowMs);
    const fixture = createRateLimitEnv([createResult({ day, resetAt })]);

    const response = await app.request(
      '/api/oliveyoung/products',
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('X-RateLimit-Reset')).toBe(String(resetAt));
    expect(callPaths(fixture.calls)).toEqual(['/consume']);
  });

  it.each([
    ['oliveyoung', '/api/oliveyoung/products'],
    ['cgv', '/api/cgv/timetable'],
    ['cu', '/api/cu/stores'],
    ['gs25', '/api/gs25/products'],
    ['lottemart', '/api/lottemart/products'],
  ] as const)('%s 한도 초과 429마다 정확히 한 건을 원장에 먼저 기록한다', async (service, path) => {
    const denied = createResult({ allowed: false, count: 3000, remaining: 0 });
    const fixture = createRateLimitEnv([denied]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(EVENT_ID);
    vi.mocked(Date.now).mockReturnValue(NOW_MS);

    const response = await app.request(
      path,
      { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
      fixture.env,
    );
    fixture.order.push('response:429');

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect((await response.json()).error.code).toBe('DAILY_RATE_LIMIT_EXCEEDED');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(callPaths(fixture.calls)).toEqual(['/consume', '/blocked-events']);
    expect(fixture.order).toEqual([
      'consume:started',
      'consume:resolved',
      'record:started',
      'record:resolved',
      'response:429',
    ]);
    expect(fixture.idFromName).toHaveBeenLastCalledWith(RATE_LIMIT_METRICS_LEDGER_NAME);
    expect(fixture.calls[1]?.durableObjectId).toBe(LEDGER_ID);
    expect(randomUuidSpy).toHaveBeenCalledTimes(1);

    const ledgerRequest = fixture.calls[1]?.request;
    expect(ledgerRequest?.method).toBe('POST');
    expect(ledgerRequest?.headers.get('Content-Type')).toBe('application/json');
    const body = await ledgerRequest?.json();
    expect(body).toEqual({
      eventId: EVENT_ID,
      occurredAt: NOW_MS,
      day: RATE_LIMIT_DAY,
      service,
      identityId: QUOTA_ID,
    });
  });

  it('교차 존 요청의 원장에는 원본·정규화 주체·단순 해시 대신 DO ID만 기록한다', async () => {
    const denied = createResult({ allowed: false, count: 3000, remaining: 0 });
    const fixture = createRateLimitEnv([denied]);
    const rawIp = '2a06:98c0:3600::103';
    const normalizedIdentity = 'worker-zone:example.com';
    const plainHash = await hashRateLimitIdentity(normalizedIdentity);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(EVENT_ID);
    vi.mocked(Date.now).mockReturnValue(KST_ROLLOVER_BEFORE_MS);

    const response = await app.request(
      '/api/cgv/timetable',
      {
        headers: {
          'CF-Connecting-IP': rawIp,
          'CF-Worker': '  Example.COM  ',
        },
      },
      fixture.env,
    );

    expect(response.status).toBe(429);
    const ledgerText = await fixture.calls[1]?.request.text();
    expect(ledgerText).toContain(`"identityId":"${QUOTA_ID}"`);
    expect(ledgerText).not.toContain(rawIp);
    expect(ledgerText).not.toContain(normalizedIdentity);
    expect(ledgerText).not.toContain(plainHash);
    expect(ledgerText).not.toContain('Example.COM');
  });

  it.each([
    ['throw', 'throw'],
    ['503', 503],
    ['200', 200],
    ['malformed', 'malformed'],
  ] as const)(
    '원장 %s 실패 시 애플리케이션 429 없이 downstream 응답으로 fail-open한다',
    async (_, outcome) => {
      const denied = createResult({ allowed: false, count: 3000, remaining: 0 });
      const fixture = createRateLimitEnv([denied], {}, outcome);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await app.request(
        '/api/oliveyoung/products',
        { headers: { 'CF-Connecting-IP': '203.0.113.10' } },
        fixture.env,
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).not.toBe('DAILY_RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('Retry-After')).toBeNull();
      expect(callPaths(fixture.calls)).toEqual(['/consume', '/blocked-events']);
      expect(
        fixture.calls.filter(({ request }) => new URL(request.url).pathname === '/blocked-events'),
      ).toHaveLength(1);
      const logged = JSON.stringify(consoleSpy.mock.calls);
      expect(logged).not.toContain('203.0.113.10');
      expect(logged).not.toContain('worker-zone:');
    },
  );

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
    expect(callPaths(fixture.calls)).toEqual(['/consume']);
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
