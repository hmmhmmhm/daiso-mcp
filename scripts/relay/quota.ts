/** 단일 중계 프로세스에서 사용하는 재시작 보존 호출 상한. */
import { readFile, rename, writeFile, realpath } from 'node:fs/promises';
interface Ledger {
  day: number;
  minute: number;
  dayCount: number;
  minuteCount: number;
}
export interface QuotaStatus {
  dailyRemaining: number;
  minuteRemaining: number;
  resetAt: { daily: number; minute: number };
  blockedBy: 'daily' | 'minute' | null;
  retryAfter: number;
}
export interface QuotaLimits {
  readonly daily: number;
  readonly minute: number;
}
export const CONVENIENCE_QUOTA_LIMITS: QuotaLimits = { daily: 10000000, minute: 690 };
const DEFAULT_QUOTA_LIMITS: QuotaLimits = { daily: 300000, minute: 300 };
export type FileQuota = (() => Promise<boolean>) & { status: () => QuotaStatus };
export async function createFileQuota(
  path: string,
  now: () => number = Date.now,
  limits: QuotaLimits = DEFAULT_QUOTA_LIMITS,
): Promise<FileQuota> {
  const { daily, minute: perMinute } = limits;
  let ledger: Ledger = { day: 0, minute: 0, dayCount: 0, minuteCount: 0 };
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Ledger;
    if (
      !value ||
      ![value.day, value.minute, value.dayCount, value.minuteCount].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    ) {
      throw new Error('Invalid quota ledger');
    }
    ledger = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let tail: Promise<unknown> = Promise.resolve();
  const take = () => {
    const task = tail.then(async () => {
      const time = now();
      const day = Math.max(ledger.day, Math.floor(time / 86400000));
      const minute = Math.max(ledger.minute, Math.floor(time / 60000));
      const dayCount = day === ledger.day ? ledger.dayCount : 0;
      const minuteCount = minute === ledger.minute ? ledger.minuteCount : 0;
      if (dayCount >= daily || minuteCount >= perMinute) return false;
      const next = { day, minute, dayCount: dayCount + 1, minuteCount: minuteCount + 1 };
      // 기록 실패를 재시도해도 프로세스 내에서 이미 소비한 예산은 되돌리지 않습니다.
      ledger = next;
      await writeFile(`${path}.tmp`, JSON.stringify(next), { mode: 0o600, flush: true });
      await rename(`${path}.tmp`, path);
      return true;
    });
    tail = task.catch(() => undefined);
    return task;
  };
  return Object.assign(take, {
    status(): QuotaStatus {
      const time = now();
      const day = Math.max(ledger.day, Math.floor(time / 86400000));
      const minute = Math.max(ledger.minute, Math.floor(time / 60000));
      const dailyRemaining = Math.max(0, daily - (day === ledger.day ? ledger.dayCount : 0));
      const minuteRemaining = Math.max(0, perMinute - (minute === ledger.minute ? ledger.minuteCount : 0));
      const resetAt = { daily: (day + 1) * 86400000, minute: (minute + 1) * 60000 };
      const blockedBy = dailyRemaining === 0 ? 'daily' : minuteRemaining === 0 ? 'minute' : null;
      const retryAfter = blockedBy ? Math.ceil((resetAt[blockedBy] - time) / 1000) : 0;
      return { dailyRemaining, minuteRemaining, resetAt, blockedBy, retryAfter };
    },
  });
}

/** 서비스별 원장이 같은 실제 디렉터리를 공유하지 않도록 검사합니다. */
export async function assertSeparateQuotaDirectories(first: string, second: string): Promise<void> {
  const [firstPath, secondPath] = await Promise.all([realpath(first), realpath(second)]);
  if (firstPath === secondPath) throw new Error('Quota directories must be separate');
}
