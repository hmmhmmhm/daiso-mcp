/**
 * 숫자/시간/날짜 포맷 공용 유틸리티
 */

export function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function formatTime(raw: string | undefined): string {
  if (!raw) {
    return '';
  }

  if (raw.includes(':')) {
    return raw;
  }

  if (raw.length === 4) {
    return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  }

  return raw;
}

export function toYyyymmdd(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = byType.year;
  const month = byType.month;
  const day = byType.day;
  return `${year}${month}${day}`;
}

/** 누락되거나 잘못된 좌석 수는 확인 불가로 유지합니다. */
export function toSeatCount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
