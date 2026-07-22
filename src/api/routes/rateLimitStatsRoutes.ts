/**
 * 인증된 일일 호출 제한 집계 조회 라우트
 */

import type { Hono } from 'hono';
import {
  RATE_LIMIT_METRICS_LEDGER_NAME,
  RATE_LIMIT_METRICS_RETENTION_DAYS,
  RATE_LIMIT_SERVICES,
  type RateLimitService,
  type RateLimitStats,
} from '../../durableObjects/rateLimitMetricsStore.js';
import { authorizeOperationalRequest } from '../operationalAuth.js';
import { errorResponse, successResponse, type AppBindings, type ApiContext } from '../response.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 7;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_QUERY_KEYS = new Set(['from', 'to', 'service']);

type StatsInput = {
  from: string;
  to: string;
  service?: RateLimitService;
};

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

function toKstDay(nowMs: number): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function addCalendarDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDayCount(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return (toMs - fromMs) / (24 * 60 * 60 * 1000) + 1;
}

function hasStrictQueryShape(searchParams: URLSearchParams): boolean {
  const counts = new Map<string, number>();
  for (const [key] of searchParams) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return false;
    }
    const count = (counts.get(key) ?? 0) + 1;
    if (count > 1) {
      return false;
    }
    counts.set(key, count);
  }
  return counts.has('from') === counts.has('to');
}

function parseStatsInput(url: URL, nowMs: number): StatsInput | undefined {
  if (!hasStrictQueryShape(url.searchParams)) {
    return undefined;
  }

  const serviceValue = url.searchParams.get('service');
  if (serviceValue !== null && !isRateLimitService(serviceValue)) {
    return undefined;
  }

  const currentDay = toKstDay(nowMs);
  const earliestDay = addCalendarDays(currentDay, -(RATE_LIMIT_METRICS_RETENTION_DAYS - 1));
  const fromValue = url.searchParams.get('from');
  const toValue = url.searchParams.get('to');
  const from = fromValue ?? addCalendarDays(currentDay, -(DEFAULT_RANGE_DAYS - 1));
  const to = toValue ?? currentDay;

  if (
    !isExactDate(from) ||
    !isExactDate(to) ||
    from > to ||
    from < earliestDay ||
    to > currentDay ||
    inclusiveDayCount(from, to) > RATE_LIMIT_METRICS_RETENTION_DAYS
  ) {
    return undefined;
  }

  return serviceValue === null ? { from, to } : { from, to, service: serviceValue };
}

function sanitizeAggregate(value: unknown): RateLimitStats['totals'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { blockedRequests, uniqueIdentities } = value;
  if (
    typeof blockedRequests !== 'number' ||
    !Number.isSafeInteger(blockedRequests) ||
    blockedRequests < 0 ||
    typeof uniqueIdentities !== 'number' ||
    !Number.isSafeInteger(uniqueIdentities) ||
    uniqueIdentities < 0 ||
    uniqueIdentities > blockedRequests
  ) {
    return undefined;
  }
  return { blockedRequests, uniqueIdentities };
}

function sanitizeDailyRows(value: unknown, input: StatsInput): RateLimitStats['daily'] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rows: RateLimitStats['daily'] = [];
  let previousDay: string | undefined;
  for (const valueRow of value) {
    if (!isRecord(valueRow)) {
      return undefined;
    }
    const aggregate = sanitizeAggregate(valueRow);
    const { day } = valueRow;
    if (
      !aggregate ||
      !isExactDate(day) ||
      day < input.from ||
      day > input.to ||
      (previousDay !== undefined && day <= previousDay)
    ) {
      return undefined;
    }
    rows.push({ day, ...aggregate });
    previousDay = day;
  }
  return rows;
}

function sanitizeServiceRows(
  value: unknown,
  input: StatsInput,
): RateLimitStats['services'] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rows: RateLimitStats['services'] = [];
  let previousKey: string | undefined;
  for (const valueRow of value) {
    if (!isRecord(valueRow)) {
      return undefined;
    }
    const aggregate = sanitizeAggregate(valueRow);
    const { day, service } = valueRow;
    const key = `${String(day)}\u0000${String(service)}`;
    if (
      !aggregate ||
      !isExactDate(day) ||
      day < input.from ||
      day > input.to ||
      !isRateLimitService(service) ||
      (input.service !== undefined && service !== input.service) ||
      (previousKey !== undefined && key <= previousKey)
    ) {
      return undefined;
    }
    rows.push({ day, service, ...aggregate });
    previousKey = key;
  }
  return rows;
}

function sumBlockedRequests(rows: Array<{ blockedRequests: number }>): number | undefined {
  let total = 0;
  for (const row of rows) {
    total += row.blockedRequests;
    if (!Number.isSafeInteger(total)) {
      return undefined;
    }
  }
  return total;
}

function sanitizeStats(value: unknown, input: StatsInput): RateLimitStats | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const totals = sanitizeAggregate(value.totals);
  const daily = sanitizeDailyRows(value.daily, input);
  const services = sanitizeServiceRows(value.services, input);
  if (!totals || !daily || !services) {
    return undefined;
  }
  if (
    sumBlockedRequests(daily) !== totals.blockedRequests ||
    sumBlockedRequests(services) !== totals.blockedRequests
  ) {
    return undefined;
  }
  return { totals, daily, services };
}

function unavailableResponse(c: ApiContext) {
  return errorResponse(
    c,
    'RATE_LIMIT_STATS_UNAVAILABLE',
    '호출 제한 통계를 조회할 수 없습니다.',
    503,
  );
}

export function registerRateLimitStatsRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/rate-limit/stats', async (c) => {
    const authorization = await authorizeOperationalRequest(
      c.req.raw.headers,
      c.env?.HEALTH_CHECK_SECRET,
    );
    if (authorization === 'not-configured') {
      return errorResponse(
        c,
        'HEALTH_CHECK_SECRET_NOT_CONFIGURED',
        'HEALTH_CHECK_SECRET이 설정되어 있지 않습니다.',
        503,
      );
    }
    if (authorization === 'unauthorized') {
      return errorResponse(
        c,
        'UNAUTHORIZED_RATE_LIMIT_STATS',
        '유효한 운영 시크릿 키가 필요합니다.',
        401,
      );
    }

    const input = parseStatsInput(new URL(c.req.url), Date.now());
    if (!input) {
      return errorResponse(
        c,
        'INVALID_RATE_LIMIT_STATS_QUERY',
        '통계 조회 조건이 올바르지 않습니다.',
        400,
      );
    }

    const namespace = c.env?.DAILY_RATE_LIMITER;
    if (!namespace) {
      return unavailableResponse(c);
    }

    try {
      const id = namespace.idFromName(RATE_LIMIT_METRICS_LEDGER_NAME);
      const stub = namespace.get(id);
      const backendUrl = new URL('https://daily-rate-limit/stats');
      backendUrl.searchParams.set('from', input.from);
      backendUrl.searchParams.set('to', input.to);
      if (input.service !== undefined) {
        backendUrl.searchParams.set('service', input.service);
      }
      const response = await stub.fetch(backendUrl.toString(), { method: 'GET' });
      if (!(response instanceof Response) || !response.ok) {
        return unavailableResponse(c);
      }
      const stats = sanitizeStats(await response.json(), input);
      return stats ? successResponse(c, stats) : unavailableResponse(c);
    } catch {
      return unavailableResponse(c);
    }
  });
}
