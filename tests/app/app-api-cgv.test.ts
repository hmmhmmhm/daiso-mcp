/**
 * 앱 통합 테스트 - CGV API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/cgv/theaters', () => {
  it('CGV 극장 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: { TheaterList: [{ TheaterCd: '0056', TheaterName: 'CGV강남', AreaCd: '01' }] },
        }),
      ),
    );

    const res = await app.request('/api/cgv/theaters?playDate=20260304&regionCode=01');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.theaters).toHaveLength(1);
  });
});

describe('GET /api/cgv/movies', () => {
  it('CGV 영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: { MovieList: [{ MovieCd: '200001', MovieName: '영화A', Grade: '12' }] },
        }),
      ),
    );

    const res = await app.request('/api/cgv/movies?playDate=20260304&theaterCode=0056');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.movies).toHaveLength(1);
  });
});

describe('GET /api/cgv/timetable', () => {
  it('CGV 시간표를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH1',
                MovieCd: 'M1',
                MovieName: '영화A',
                TheaterCd: '0056',
                TheaterName: 'CGV강남',
                PlayYmd: '20260304',
                StartTime: '0930',
                EndTime: '1130',
                TotalSeat: 100,
                RemainSeat: 30,
              },
            ],
          },
        }),
      ),
    );

    const res = await app.request('/api/cgv/timetable?playDate=20260304&theaterCode=0056');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.timetable).toHaveLength(1);
  });
});
