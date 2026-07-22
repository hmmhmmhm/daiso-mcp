/**
 * Zyte 연동 공개 GET API의 클라이언트별 일일 호출 제한 미들웨어
 */

import type { MiddlewareHandler } from 'hono';
import { errorResponse, type AppBindings } from '../api/response.js';
import {
  DAILY_RATE_LIMIT,
  toKstDay,
  type DailyRateLimitResult,
} from '../durableObjects/dailyRateLimiter.js';
import {
  RATE_LIMIT_METRICS_LEDGER_NAME,
  type BlockedRateLimitEvent,
  type RateLimitService,
} from '../durableObjects/rateLimitMetricsStore.js';

const PROTECTED_SERVICES: ReadonlyArray<{ prefix: string; service: RateLimitService }> = [
  { prefix: '/api/oliveyoung/', service: 'oliveyoung' },
  { prefix: '/api/cgv/', service: 'cgv' },
  { prefix: '/api/cu/', service: 'cu' },
  { prefix: '/api/gs25/', service: 'gs25' },
  { prefix: '/api/lottemart/', service: 'lottemart' },
] as const;

// Cloudflare가 교차 존 Worker subrequest에 사용하는 공통 client IP
const CROSS_ZONE_WORKER_CLIENT_IP = '2a06:98c0:3600::103';

interface DailyRateLimitDecision {
  result: DailyRateLimitResult;
  service: RateLimitService;
  identityId: DurableObjectId;
  namespace: DurableObjectNamespace;
}

function resolveRateLimitService(request: Request): RateLimitService | null {
  if (request.method !== 'GET') {
    return null;
  }

  const pathname = new URL(request.url).pathname;
  return PROTECTED_SERVICES.find(({ prefix }) => pathname.startsWith(prefix))?.service ?? null;
}

export function isDailyRateLimitedRequest(request: Request): boolean {
  return resolveRateLimitService(request) !== null;
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

async function consumeDailyRateLimitDecision(
  request: Request,
  env?: AppBindings,
): Promise<DailyRateLimitDecision | null> {
  const service = resolveRateLimitService(request);
  if (!service || isHealthCheckBypass(request, env)) {
    return null;
  }

  const identity = resolveRateLimitIdentity(request);
  const namespace = env?.DAILY_RATE_LIMITER;
  if (!identity || !namespace) {
    return null;
  }

  try {
    const identityId = namespace.idFromName(await hashRateLimitIdentity(identity));
    const stub = namespace.get(identityId);
    const response = await stub.fetch('https://daily-rate-limit/consume', { method: 'POST' });
    if (!response.ok) {
      console.error('일일 호출 제한 확인 실패', `Durable Object HTTP ${response.status}`);
      return null;
    }

    return {
      result: (await response.json()) as DailyRateLimitResult,
      service,
      identityId,
      namespace,
    };
  } catch {
    console.error('일일 호출 제한 확인 실패');
    return null;
  }
}

export async function consumeDailyRateLimit(
  request: Request,
  env?: AppBindings,
): Promise<DailyRateLimitResult | null> {
  return (await consumeDailyRateLimitDecision(request, env))?.result ?? null;
}

async function recordBlockedRateLimitEvent(decision: DailyRateLimitDecision): Promise<boolean> {
  const occurredAt = Date.now();
  const occurredDay = toKstDay(occurredAt);
  const event: BlockedRateLimitEvent = {
    eventId: crypto.randomUUID(),
    occurredAt,
    day: decision.result.day === occurredDay ? decision.result.day : occurredDay,
    service: decision.service,
    identityId: decision.identityId.toString(),
  };

  try {
    const ledgerId = decision.namespace.idFromName(RATE_LIMIT_METRICS_LEDGER_NAME);
    const ledger = decision.namespace.get(ledgerId);
    const response = await ledger.fetch('https://daily-rate-limit/blocked-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!(response instanceof Response)) {
      console.error('일일 호출 제한 원장 기록 실패', '응답 형식 오류');
      return false;
    }
    if (response.status !== 204) {
      console.error('일일 호출 제한 원장 기록 실패', `Durable Object HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch {
    console.error('일일 호출 제한 원장 기록 실패');
    return false;
  }
}

export function setRateLimitHeaders(headers: Headers, result: DailyRateLimitResult): void {
  headers.set('X-RateLimit-Limit', String(DAILY_RATE_LIMIT));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(result.resetAt));
}

export function createDailyRateLimitMiddleware(): MiddlewareHandler<{ Bindings: AppBindings }> {
  return async (c, next) => {
    const decision = await consumeDailyRateLimitDecision(c.req.raw, c.env);
    if (!decision) {
      return next();
    }

    const { result } = decision;
    if (!result.allowed) {
      if (!(await recordBlockedRateLimitEvent(decision))) {
        return next();
      }
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
