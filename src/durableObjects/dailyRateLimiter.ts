/**
 * IP별 KST 일일 호출량을 저장하는 Durable Object
 */

import {
  RATE_LIMIT_SERVICES,
  RateLimitMetricsStore,
  type BlockedRateLimitEvent,
  type RateLimitService,
} from './rateLimitMetricsStore.js';

export const DAILY_RATE_LIMIT = 3000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const COUNTER_KEY = 'counter';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// DurableObjectId.toString()이 반환하는 namespace-scoped 불투명 ID 형식입니다.
const DURABLE_OBJECT_ID_PATTERN = /^[0-9a-f]{64}$/;
const BLOCKED_EVENT_FIELDS = ['eventId', 'occurredAt', 'day', 'service', 'identityId'] as const;

interface StoredCounter {
  day: string;
  count: number;
}

export interface DailyRateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: number;
  day: string;
}

export function toKstDay(nowMs: number): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextKstMidnightEpochSeconds(nowMs: number): number {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  const nextMidnightUtcMs =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) -
    KST_OFFSET_MS;

  return Math.floor(nextMidnightUtcMs / 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isRateLimitService(value: unknown): value is RateLimitService {
  return typeof value === 'string' && (RATE_LIMIT_SERVICES as readonly string[]).includes(value);
}

function isBlockedRateLimitEvent(value: unknown): value is BlockedRateLimitEvent {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== BLOCKED_EVENT_FIELDS.length ||
    !BLOCKED_EVENT_FIELDS.every((field) => Object.hasOwn(value, field))
  ) {
    return false;
  }

  const occurredAt = value.occurredAt;
  return (
    typeof value.eventId === 'string' &&
    UUID_PATTERN.test(value.eventId) &&
    typeof occurredAt === 'number' &&
    Number.isSafeInteger(occurredAt) &&
    occurredAt >= 0 &&
    Number.isFinite(new Date(occurredAt).getTime()) &&
    Number.isFinite(new Date(occurredAt + KST_OFFSET_MS).getTime()) &&
    isExactDate(value.day) &&
    value.day === toKstDay(occurredAt) &&
    isRateLimitService(value.service) &&
    typeof value.identityId === 'string' &&
    DURABLE_OBJECT_ID_PATTERN.test(value.identityId)
  );
}

async function parseBlockedEvent(request: Request): Promise<BlockedRateLimitEvent | undefined> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return undefined;
  }
  if (!isBlockedRateLimitEvent(value)) {
    return undefined;
  }

  // 검증한 필드만 새 객체로 만들어 원장에 전달합니다.
  return {
    eventId: value.eventId,
    occurredAt: value.occurredAt,
    day: value.day,
    service: value.service,
    identityId: value.identityId,
  };
}

function hasStrictStatsParameters(searchParams: URLSearchParams): boolean {
  let fromCount = 0;
  let toCount = 0;
  let serviceCount = 0;
  for (const [key] of searchParams) {
    if (key === 'from') {
      fromCount += 1;
    } else if (key === 'to') {
      toCount += 1;
    } else if (key === 'service') {
      serviceCount += 1;
    } else {
      return false;
    }
  }
  return fromCount === 1 && toCount === 1 && serviceCount <= 1;
}

function parseStatsInput(
  url: URL,
): { from: string; to: string; service?: RateLimitService } | undefined {
  if (!hasStrictStatsParameters(url.searchParams)) {
    return undefined;
  }
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const service = url.searchParams.get('service');
  if (!isExactDate(from) || !isExactDate(to) || from > to) {
    return undefined;
  }
  if (service !== null && !isRateLimitService(service)) {
    return undefined;
  }

  return service === null ? { from, to } : { from, to, service };
}

function errorResponse(message: string, status: 400 | 404): Response {
  return Response.json({ error: message }, { status });
}

export class DailyRateLimiter {
  private metricsStore: RateLimitMetricsStore | undefined;

  constructor(private readonly state: DurableObjectState) {}

  async consume(nowMs = Date.now()): Promise<DailyRateLimitResult> {
    const day = toKstDay(nowMs);
    const stored = await this.state.storage.get<StoredCounter>(COUNTER_KEY);
    const currentCount = stored?.day === day ? stored.count : 0;
    const allowed = currentCount < DAILY_RATE_LIMIT;
    const count = allowed ? currentCount + 1 : currentCount;

    if (allowed) {
      await this.state.storage.put(COUNTER_KEY, { day, count });
    }

    return {
      allowed,
      count,
      remaining: Math.max(0, DAILY_RATE_LIMIT - count),
      resetAt: nextKstMidnightEpochSeconds(nowMs),
      day,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/consume') {
      return Response.json(await this.consume());
    }

    if (request.method === 'POST' && url.pathname === '/blocked-events') {
      const event = await parseBlockedEvent(request);
      if (!event) {
        return errorResponse('차단 이벤트 형식이 올바르지 않습니다.', 400);
      }
      const store = this.getMetricsStore();
      await store.record(event);
      return new Response(null, { status: 204 });
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      const input = parseStatsInput(url);
      if (!input) {
        return errorResponse('통계 조회 조건이 올바르지 않습니다.', 400);
      }
      const store = this.getMetricsStore();
      return Response.json(await store.query(input));
    }

    return errorResponse('요청한 작업을 찾을 수 없습니다.', 404);
  }

  async alarm(): Promise<void> {
    const store = this.getMetricsStore();
    await store.cleanup();
    await store.ensureAlarm();
  }

  private getMetricsStore(): RateLimitMetricsStore {
    this.metricsStore ??= new RateLimitMetricsStore(this.state);
    return this.metricsStore;
  }
}
