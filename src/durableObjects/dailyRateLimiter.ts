/**
 * IP별 KST 일일 호출량을 저장하는 Durable Object
 */

export const DAILY_RATE_LIMIT = 3000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const COUNTER_KEY = 'counter';

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
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - KST_OFFSET_MS;

  return Math.floor(nextMidnightUtcMs / 1000);
}

export class DailyRateLimiter {
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

  async fetch(): Promise<Response> {
    return Response.json(await this.consume());
  }
}
