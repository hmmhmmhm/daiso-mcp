import { describe, expect, it } from 'vitest';
import { formatTime, toNumber, toYyyymmdd } from '../../src/utils/format.js';

describe('format utilities', () => {
  it('한국 자정 이후에는 UTC 전날이 아닌 한국 날짜를 반환한다', () => {
    expect(toYyyymmdd(new Date('2026-07-27T15:30:00.000Z'))).toBe('20260728');
  });

  it('숫자와 시간의 기존 정규화를 유지한다', () => {
    expect(toNumber('12')).toBe(12);
    expect(formatTime('0930')).toBe('09:30');
  });
});
