/**
 * 워커 호출량 차트 헬퍼 테스트
 */
import { describe, expect, it } from 'vitest';
import {
  buildDataLabelIndexes,
  buildReadmeSection,
  calculateSummary,
  shouldShowWeeklyTick,
  WORKERS_CHART_ACCENT_COLORS,
} from '../../scripts/ops/workers-chart-helpers.ts';

describe('buildReadmeSection', () => {
  it('호출량 그래프 아래에 일일 합산 호출 제한 안내를 유지한다', () => {
    const section = buildReadmeSection({
      scriptName: 'daiso-mcp',
      updatedAt: '2026-07-17 22:55 KST',
      days: 30,
      startDate: '2026-06-18',
      endDate: '2026-07-17',
      cacheKey: '2026-07-17T13:55:00.000Z',
    });

    expect(section).toContain('> [!IMPORTANT]');
    expect(section).toContain('2026년 7월 18일부터');
    expect(section).toContain('IP당 하루 합산 3,000회(KST 기준)');
    expect(section.indexOf('workers-invocations.png')).toBeLessThan(
      section.indexOf('> [!IMPORTANT]'),
    );
  });

  it('GitHub 알림 카드가 되도록 중앙 정렬 영역 밖에 안내문을 둔다', () => {
    const section = buildReadmeSection({
      scriptName: 'daiso-mcp',
      updatedAt: '2026-07-17 23:05 KST',
      days: 30,
      startDate: '2026-06-18',
      endDate: '2026-07-17',
      cacheKey: '2026-07-17T14:05:00.000Z',
    });

    expect(section).toContain('</div>\n\n> [!IMPORTANT]');
    expect(section).toContain('이용해 주세요.\n\n<div align="center">');
  });
});

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
