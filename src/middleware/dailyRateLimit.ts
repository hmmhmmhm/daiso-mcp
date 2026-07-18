/**
 * Zyte 연동 공개 GET API의 클라이언트별 일일 호출 제한 미들웨어
 */

import type { MiddlewareHandler } from 'hono';
import { errorResponse, type AppBindings } from '../api/response.js';
import { DAILY_RATE_LIMIT, type DailyRateLimitResult } from '../durableObjects/dailyRateLimiter.js';

const PROTECTED_PREFIXES = [
  '/api/oliveyoung/',
  '/api/cgv/',
  '/api/cu/',
  '/api/gs25/',
  '/api/lottemart/',
] as const;

// Cloudflare가 교차 존 Worker subrequest에 사용하는 공통 client IP
const CROSS_ZONE_WORKER_CLIENT_IP = '2a06:98c0:3600::103';

export function isDailyRateLimitedRequest(request: Request): boolean {
  if (request.method !== 'GET') {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isHealthCheckBypass(request: Request, env?: AppBindings): boolean {
  const secret = env?.HEALTH_CHECK_SECRET?.trim();
  if (!secret) {
    return false;
  }

  return request.headers.get('x-health-check-key')?.trim() === secret;
}

export async function hashRateLimitIdentity(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function resolveRateLimitIdentity(request: Request): string | null {
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!ip || ip !== CROSS_ZONE_WORKER_CLIENT_IP) {
    return ip || null;
  }

  const workerZone = request.headers.get('CF-Worker')?.trim().toLowerCase();
  return workerZone ? `worker-zone:${workerZone}` : ip;
}

export async function consumeDailyRateLimit(
  request: Request,
  env?: AppBindings,
): Promise<DailyRateLimitResult | null> {
  if (!isDailyRateLimitedRequest(request) || isHealthCheckBypass(request, env)) {
    return null;
  }

  const identity = resolveRateLimitIdentity(request);
  if (!identity || !env?.DAILY_RATE_LIMITER) {
    return null;
  }

  try {
    const id = env.DAILY_RATE_LIMITER.idFromName(await hashRateLimitIdentity(identity));
    const stub = env.DAILY_RATE_LIMITER.get(id);
    const response = await stub.fetch('https://daily-rate-limit/consume', { method: 'POST' });
    if (!response.ok) {
      console.error('일일 호출 제한 확인 실패', `Durable Object HTTP ${response.status}`);
      return null;
    }

    return (await response.json()) as DailyRateLimitResult;
  } catch (error) {
    console.error(
      '일일 호출 제한 확인 실패',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export function setRateLimitHeaders(headers: Headers, result: DailyRateLimitResult): void {
  headers.set('X-RateLimit-Limit', String(DAILY_RATE_LIMIT));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(result.resetAt));
}

export function createDailyRateLimitMiddleware(): MiddlewareHandler<{ Bindings: AppBindings }> {
  return async (c, next) => {
    const result = await consumeDailyRateLimit(c.req.raw, c.env);
    if (!result) {
      return next();
    }

    if (!result.allowed) {
      const response = errorResponse(
        c,
        'DAILY_RATE_LIMIT_EXCEEDED',
        '이 IP의 일일 호출 한도 3,000회를 초과했습니다.',
        429,
      );
      setRateLimitHeaders(response.headers, result);
      response.headers.set(
        'Retry-After',
        String(Math.max(1, result.resetAt - Math.floor(Date.now() / 1000))),
      );
      return response;
    }

    await next();
    setRateLimitHeaders(c.res.headers, result);
  };
}
