import { expect, vi } from 'vitest';
import type { AppBindings } from '../../src/api/response.js';
import type { RateLimitStats } from '../../src/durableObjects/rateLimitMetricsStore.js';

export const SECRET = 'test-secret';
export const NOW_MS = Date.parse('2026-07-22T03:00:00.000Z');
export const EMPTY_STATS: RateLimitStats = {
  totals: { blockedRequests: 0, uniqueIdentities: 0 },
  daily: [],
  services: [],
};
export const FILTERED_STATS: RateLimitStats = {
  totals: { blockedRequests: 3, uniqueIdentities: 2 },
  daily: [
    { day: '2026-07-20', blockedRequests: 1, uniqueIdentities: 1 },
    { day: '2026-07-22', blockedRequests: 2, uniqueIdentities: 2 },
  ],
  services: [
    { day: '2026-07-20', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 },
    { day: '2026-07-22', service: 'cgv', blockedRequests: 2, uniqueIdentities: 2 },
  ],
};
export const UNFILTERED_STATS: RateLimitStats = {
  totals: { blockedRequests: 5, uniqueIdentities: 3 },
  daily: [
    { day: '2026-07-20', blockedRequests: 2, uniqueIdentities: 2 },
    { day: '2026-07-22', blockedRequests: 3, uniqueIdentities: 3 },
  ],
  services: [
    { day: '2026-07-20', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 },
    { day: '2026-07-20', service: 'cu', blockedRequests: 1, uniqueIdentities: 1 },
    { day: '2026-07-22', service: 'cgv', blockedRequests: 2, uniqueIdentities: 2 },
    { day: '2026-07-22', service: 'cu', blockedRequests: 1, uniqueIdentities: 1 },
  ],
};

export const CONTRADICTORY_STATS_CASES: ReadonlyArray<
  readonly [string, unknown, 'filtered' | 'unfiltered']
> = [
  [
    'unfiltered 일자별 blocked 배분 불일치',
    {
      ...UNFILTERED_STATS,
      services: [
        { day: '2026-07-20', service: 'cgv', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-20', service: 'cu', blockedRequests: 1, uniqueIdentities: 1 },
        { day: '2026-07-22', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 },
        { day: '2026-07-22', service: 'cu', blockedRequests: 1, uniqueIdentities: 1 },
      ],
    },
    'unfiltered',
  ],
  [
    'filtered 일자별 blocked 불일치',
    {
      ...FILTERED_STATS,
      services: [
        { day: '2026-07-20', service: 'cgv', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-22', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 },
      ],
    },
    'filtered',
  ],
  [
    'filtered 일자별 unique 불일치',
    {
      totals: { blockedRequests: 5, uniqueIdentities: 2 },
      daily: [
        { day: '2026-07-20', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-22', blockedRequests: 3, uniqueIdentities: 2 },
      ],
      services: [
        { day: '2026-07-20', service: 'cgv', blockedRequests: 2, uniqueIdentities: 2 },
        { day: '2026-07-22', service: 'cgv', blockedRequests: 3, uniqueIdentities: 1 },
      ],
    },
    'filtered',
  ],
  [
    'daily unique가 global unique 초과',
    { ...FILTERED_STATS, totals: { blockedRequests: 3, uniqueIdentities: 1 } },
    'filtered',
  ],
  [
    'global unique가 일별 distinct 합 초과',
    {
      totals: { blockedRequests: 4, uniqueIdentities: 3 },
      daily: [
        { day: '2026-07-20', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-22', blockedRequests: 2, uniqueIdentities: 1 },
      ],
      services: [
        { day: '2026-07-20', service: 'cgv', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-22', service: 'cgv', blockedRequests: 2, uniqueIdentities: 1 },
      ],
    },
    'filtered',
  ],
  [
    'service unique가 daily와 global unique 초과',
    {
      ...FILTERED_STATS,
      totals: { blockedRequests: 3, uniqueIdentities: 1 },
      daily: FILTERED_STATS.daily.map((row) => ({ ...row, uniqueIdentities: 1 })),
    },
    'filtered',
  ],
  [
    'daily zero grouped row',
    {
      ...EMPTY_STATS,
      daily: [{ day: '2026-07-20', blockedRequests: 0, uniqueIdentities: 0 }],
    },
    'unfiltered',
  ],
  [
    'service zero grouped row',
    {
      ...EMPTY_STATS,
      services: [{ day: '2026-07-20', service: 'cgv', blockedRequests: 0, uniqueIdentities: 0 }],
    },
    'unfiltered',
  ],
  [
    'positive daily row의 zero unique',
    {
      totals: { blockedRequests: 1, uniqueIdentities: 0 },
      daily: [{ day: '2026-07-20', blockedRequests: 1, uniqueIdentities: 0 }],
      services: [{ day: '2026-07-20', service: 'cgv', blockedRequests: 1, uniqueIdentities: 0 }],
    },
    'unfiltered',
  ],
  [
    'service가 daily에 없는 날짜에 배정됨',
    {
      totals: { blockedRequests: 1, uniqueIdentities: 1 },
      daily: [{ day: '2026-07-20', blockedRequests: 1, uniqueIdentities: 1 }],
      services: [{ day: '2026-07-21', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 }],
    },
    'unfiltered',
  ],
  [
    'daily unique가 service unique 최댓값보다 작음',
    {
      totals: { blockedRequests: 4, uniqueIdentities: 3 },
      daily: [{ day: '2026-07-20', blockedRequests: 4, uniqueIdentities: 2 }],
      services: [
        { day: '2026-07-20', service: 'cgv', blockedRequests: 3, uniqueIdentities: 3 },
        { day: '2026-07-20', service: 'cu', blockedRequests: 1, uniqueIdentities: 1 },
      ],
    },
    'unfiltered',
  ],
  [
    'daily unique가 service unique 합보다 큼',
    {
      totals: { blockedRequests: 4, uniqueIdentities: 3 },
      daily: [{ day: '2026-07-20', blockedRequests: 4, uniqueIdentities: 3 }],
      services: [
        { day: '2026-07-20', service: 'cgv', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-20', service: 'cu', blockedRequests: 2, uniqueIdentities: 1 },
      ],
    },
    'unfiltered',
  ],
  [
    'duplicate daily row',
    { ...EMPTY_STATS, daily: [FILTERED_STATS.daily[0], FILTERED_STATS.daily[0]] },
    'unfiltered',
  ],
  [
    'duplicate service row',
    { ...EMPTY_STATS, services: [FILTERED_STATS.services[0], FILTERED_STATS.services[0]] },
    'unfiltered',
  ],
  [
    'totals unique가 blocked 초과',
    { ...EMPTY_STATS, totals: { blockedRequests: 1, uniqueIdentities: 2 } },
    'unfiltered',
  ],
  [
    'daily unique가 blocked 초과',
    {
      ...EMPTY_STATS,
      daily: [{ day: '2026-07-20', blockedRequests: 1, uniqueIdentities: 2 }],
    },
    'unfiltered',
  ],
  [
    'service unique가 blocked 초과',
    {
      ...EMPTY_STATS,
      services: [{ day: '2026-07-20', service: 'cgv', blockedRequests: 1, uniqueIdentities: 2 }],
    },
    'unfiltered',
  ],
];

export type BackendOutcome = unknown | Response | 'throw';

export function createStatsFixture(outcome: BackendOutcome = EMPTY_STATS) {
  const calls: Request[] = [];
  const ledgerId = { toString: () => 'reserved-ledger-id' } as unknown as DurableObjectId;
  const stubFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    if (outcome === 'throw') {
      throw new Error('backend failed with test-secret and 203.0.113.10');
    }
    if (typeof outcome === 'function') {
      return outcome(request) as Response | Promise<Response>;
    }
    return outcome instanceof Response ? outcome : Response.json(outcome);
  });
  const get = vi.fn(() => ({ fetch: stubFetch }) as unknown as DurableObjectStub);
  const idFromName = vi.fn(() => ledgerId);
  const env: AppBindings = {
    HEALTH_CHECK_SECRET: SECRET,
    DAILY_RATE_LIMITER: { get, idFromName } as unknown as DurableObjectNamespace,
  };

  return { calls, env, get, idFromName, ledgerId, stubFetch };
}

export function authenticatedHeaders(header: 'bearer' | 'key' = 'bearer'): HeadersInit {
  return header === 'bearer'
    ? { Authorization: `Bearer ${SECRET}` }
    : { 'x-health-check-key': SECRET };
}

export async function expectApiError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({
    success: false,
    error: { code, message },
  });
}
