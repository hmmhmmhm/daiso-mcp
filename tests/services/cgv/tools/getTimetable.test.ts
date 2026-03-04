/**
 * CGV 시간표 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGetTimetableTool } from '../../../../src/services/cgv/tools/getTimetable.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createGetTimetableTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createGetTimetableTool();

    expect(tool.name).toBe('cgv_get_timetable');
    expect(tool.metadata.title).toBe('CGV 시간표 조회');
  });

  it('시간표를 시간순으로 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH2',
                MovieCd: 'M1',
                MovieName: '영화A',
                TheaterCd: '0056',
                TheaterName: 'CGV강남',
                PlayYmd: '20260304',
                StartTime: '1200',
                EndTime: '1400',
                TotalSeat: 120,
                RemainSeat: 40,
              },
              {
                ScheduleNo: 'SCH1',
                MovieCd: 'M1',
                MovieName: '영화A',
                TheaterCd: '0056',
                TheaterName: 'CGV강남',
                PlayYmd: '20260304',
                StartTime: '0930',
                EndTime: '1130',
                TotalSeat: 120,
                RemainSeat: 50,
              },
            ],
          },
        }),
      ),
    );

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260304', theaterCode: '0056', movieCode: 'M1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.timetable[0].scheduleId).toBe('SCH1');
    expect(parsed.filters.theaterCode).toBe('0056');
    expect(parsed.filters.movieCode).toBe('M1');
  });

  it('필터가 없으면 null로 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ d: { TimeTableList: [] } })));

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBeNull();
    expect(parsed.filters.movieCode).toBeNull();
  });
});
