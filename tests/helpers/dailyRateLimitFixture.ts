import { vi } from 'vitest';
import type { AppBindings } from '../../src/api/response.js';
import {
  nextKstMidnightEpochSeconds,
  type DailyRateLimitResult,
} from '../../src/durableObjects/dailyRateLimiter.js';
import { RATE_LIMIT_METRICS_LEDGER_NAME } from '../../src/durableObjects/rateLimitMetricsStore.js';

export const ORIGINAL_CACHES = (globalThis as { caches?: CacheStorage }).caches;
export const QUOTA_ID = '1'.repeat(64);
export const LEDGER_ID = 'f'.repeat(64);
export const EVENT_ID = '018d6b61-b263-7f5c-8c2d-1c01b849eea7';
export const NOW_MS = Date.parse('2026-07-22T00:01:02.345Z');
export const KST_ROLLOVER_BEFORE_MS = Date.parse('2026-07-22T14:59:59.999Z');
export const KST_ROLLOVER_AFTER_MS = Date.parse('2026-07-22T15:00:00.000Z');
export const RATE_LIMIT_DAY = '2026-07-22';

export type LedgerOutcome =
  204 | 200 | 503 | 'throw' | 'malformed' | ((request: Request) => Response | Promise<Response>);

export interface DurableObjectCall {
  durableObjectId: string;
  request: Request;
}

export function createResult(overrides: Partial<DailyRateLimitResult> = {}): DailyRateLimitResult {
  return {
    allowed: true,
    count: 1,
    remaining: 2999,
    resetAt: nextKstMidnightEpochSeconds(NOW_MS),
    day: RATE_LIMIT_DAY,
    ...overrides,
  };
}

function createDurableObjectId(value: string): DurableObjectId {
  return { toString: () => value } as unknown as DurableObjectId;
}

function createQuotaResponse(value: unknown): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, 'json', { value: async () => value });
  return response;
}

export function createRateLimitEnv(
  results: unknown[],
  additional: Partial<AppBindings> = {},
  ledgerOutcome: LedgerOutcome = 204,
  afterQuotaResponse: () => void = () => undefined,
) {
  const queue = [...results];
  const calls: DurableObjectCall[] = [];
  const order: string[] = [];
  const quotaIds = new Map<string, DurableObjectId>();
  const ledgerId = createDurableObjectId(LEDGER_ID);
  const idFromName = vi.fn((name: string) => {
    if (name === RATE_LIMIT_METRICS_LEDGER_NAME) {
      return ledgerId;
    }
    let id = quotaIds.get(name);
    if (!id) {
      id = createDurableObjectId(
        (QUOTA_ID.slice(0, -1) + (quotaIds.size + 1).toString(16)).padStart(64, '0'),
      );
      quotaIds.set(name, id);
    }
    return id;
  });
  const stubFetch = vi.fn(
    async (durableObjectId: string, input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push({ durableObjectId, request });
      if (new URL(request.url).pathname === '/consume') {
        order.push('consume:started');
        const result = queue.length > 0 ? queue.shift() : createResult();
        const response = createQuotaResponse(result);
        order.push('consume:resolved');
        afterQuotaResponse();
        return response;
      }

      order.push('record:started');
      if (typeof ledgerOutcome === 'function') {
        const response = await ledgerOutcome(request);
        order.push('record:resolved');
        return response;
      }
      if (ledgerOutcome === 'throw') {
        throw new Error('민감한 원장 오류 203.0.113.10');
      }
      if (ledgerOutcome === 'malformed') {
        return { status: 204 } as Response;
      }
      const response = new Response(ledgerOutcome === 204 ? null : 'ledger response', {
        status: ledgerOutcome,
      });
      order.push('record:resolved');
      return response;
    },
  );
  const get = vi.fn((id: DurableObjectId) => ({
    fetch: (input: RequestInfo | URL, init?: RequestInit) => stubFetch(id.toString(), input, init),
  }));
  const env: AppBindings = {
    DAILY_RATE_LIMITER: { get, idFromName } as unknown as DurableObjectNamespace,
    ...additional,
  };

  return { env, idFromName, get, stubFetch, calls, order };
}

export function callPaths(calls: DurableObjectCall[]): string[] {
  return calls.map(({ request }) => new URL(request.url).pathname);
}

export const MALFORMED_QUOTA_RESULTS: ReadonlyArray<readonly [string, unknown]> = [
  ['빈 객체', {}],
  ['null', null],
  ['배열', []],
  ['문자열 allowed', { ...createResult(), allowed: 'true' }],
  ['NaN count', { ...createResult(), count: Number.NaN }],
  ['소수 count', { ...createResult(), count: 1.5 }],
  ['음수 count', { ...createResult(), count: -1 }],
  ['한도 초과 count', { ...createResult(), count: 3001 }],
  ['NaN remaining', { ...createResult(), remaining: Number.NaN }],
  ['소수 remaining', { ...createResult(), remaining: 1.5 }],
  ['음수 remaining', { ...createResult(), remaining: -1 }],
  ['한도 초과 remaining', { ...createResult(), remaining: 3001 }],
  ['NaN resetAt', { ...createResult(), resetAt: Number.NaN }],
  ['소수 resetAt', { ...createResult(), resetAt: 1.5 }],
  ['음수 resetAt', { ...createResult(), resetAt: -1 }],
  ['safe integer 초과 resetAt', { ...createResult(), resetAt: Number.MAX_SAFE_INTEGER + 1 }],
  ['잘못된 날짜 형식', { ...createResult(), day: '2026/07/17' }],
  ['존재하지 않는 날짜', { ...createResult(), day: '2026-02-29' }],
  ['허용 결과의 불일치한 remaining', { ...createResult(), remaining: 0 }],
  ['거부 결과의 불일치한 count', { ...createResult(), allowed: false, count: 2999, remaining: 1 }],
];
