/**
 * 워커 호출량 차트 헬퍼 테스트
 */
import { describe, expect, it } from 'vitest';
import {
  buildDataLabelIndexes,
  calculateSummary,
  shouldShowWeeklyTick,
  WORKERS_CHART_ACCENT_COLORS,
} from '../../scripts/ops/workers-chart-helpers.ts';

describe('calculateSummary', () => {
  it('중앙값, 최근 7일 평균, 전주 대비를 계산한다', () => {
    const points = Array.from({ length: 14 }, (_, index) => ({
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      requests: (index + 1) * 100,
    }));

    const summary = calculateSummary(points);

    expect(summary.median).toBe(750);
    expect(summary.recent7Total).toBe(7700);
    expect(summary.recent7Average).toBe(1100);
    expect(summary.previous7Total).toBe(2800);
    expect(summary.weekOverWeekDiff).toBe(4900);
    expect(summary.weekOverWeekPercent).toBe(175);
  });
});

describe('buildDataLabelIndexes', () => {
  it('최신일, 최고일, 급증일만 라벨 대상으로 고른다', () => {
    const points = [
      { date: '2026-05-01', requests: 100 },
      { date: '2026-05-02', requests: 120 },
      { date: '2026-05-03', requests: 900 },
      { date: '2026-05-04', requests: 140 },
      { date: '2026-05-05', requests: 160 },
    ];

    expect([...buildDataLabelIndexes(points)]).toEqual([2, 4]);
  });
});

describe('shouldShowWeeklyTick', () => {
  it('첫날, 마지막날, 가장자리와 겹치지 않는 월요일만 x축 라벨을 표시한다', () => {
    const points = [
      { date: '2026-05-01', requests: 100 },
      { date: '2026-05-02', requests: 100 },
      { date: '2026-05-04', requests: 100 },
      { date: '2026-05-05', requests: 100 },
      { date: '2026-05-06', requests: 100 },
    ];

    expect(points.map((point, index) => shouldShowWeeklyTick(points, index))).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
  });
});

describe('WORKERS_CHART_ACCENT_COLORS', () => {
  it('보조선 색상은 amber 계열을 사용한다', () => {
    expect(WORKERS_CHART_ACCENT_COLORS.movingAverage).toBe('#f59e0b');
    expect(WORKERS_CHART_ACCENT_COLORS.recent14Line).toBe('#f59e0b');
    expect(WORKERS_CHART_ACCENT_COLORS.recent14Label).toBe('#b45309');
  });
});
