/** 단일 중계 프로세스에서 사용하는 재시작 보존 호출 상한. */
import { readFile, rename, writeFile } from 'node:fs/promises';
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
export type FileQuota = (() => Promise<boolean>) & { status: () => QuotaStatus };
export async function createFileQuota(
  path: string,
  now: () => number = Date.now,
): Promise<FileQuota> {
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
      if (dayCount >= 3000 || minuteCount >= 30) return false;
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
      const dailyRemaining = Math.max(0, 3000 - (day === ledger.day ? ledger.dayCount : 0));
      const minuteRemaining = Math.max(0, 30 - (minute === ledger.minute ? ledger.minuteCount : 0));
      const resetAt = { daily: (day + 1) * 86400000, minute: (minute + 1) * 60000 };
      const blockedBy = dailyRemaining === 0 ? 'daily' : minuteRemaining === 0 ? 'minute' : null;
      const retryAfter = blockedBy ? Math.ceil((resetAt[blockedBy] - time) / 1000) : 0;
      return { dailyRemaining, minuteRemaining, resetAt, blockedBy, retryAfter };
    },
  });
}
