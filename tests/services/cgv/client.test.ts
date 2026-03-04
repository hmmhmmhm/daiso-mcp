/**
 * CGV 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCgvMovies,
  fetchCgvTheaters,
  fetchCgvTimetable,
  toYyyymmdd,
} from '../../../src/services/cgv/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCgvTheaters', () => {
  it('극장 목록을 정규화한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TheaterList: [
              { TheaterCd: '0056', TheaterName: 'CGV강남', AreaCd: '01' },
              { TheaterCd: '0041', TheaterName: 'CGV용산아이파크몰', AreaCd: '01' },
            ],
          },
        }),
      ),
    );

    const result = await fetchCgvTheaters({ playDate: '20260304', regionCode: '01' });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ theaterCode: '0056', theaterName: 'CGV강남', regionCode: '01' });
  });

  it('HTTP 에러를 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response('fail', { status: 500 }));

    await expect(fetchCgvTheaters({})).rejects.toThrow('CGV API 호출 실패: 500');
  });

  it('AbortError를 시간 초과 에러로 변환한다', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(fetchCgvTheaters({})).rejects.toThrow('CGV API 요청 시간 초과');
  });
});

describe('fetchCgvMovies', () => {
  it('영화 목록을 정규화한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            MovieList: [
              { MovieCd: '200001', MovieName: '테스트 영화', Grade: '12' },
              { MovieCd: '200002', MovieName: '테스트 영화2', Grade: '15' },
            ],
          },
        }),
      ),
    );

    const result = await fetchCgvMovies({ playDate: '20260304', theaterCode: '0056' });

    expect(result).toHaveLength(2);
    expect(result[0].movieCode).toBe('200001');
    expect(result[0].rating).toBe('12');
  });
});

describe('fetchCgvTimetable', () => {
  it('시간표를 정규화하고 시간 포맷을 변환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH1',
                MovieCd: '200001',
                MovieName: '테스트 영화',
                TheaterCd: '0056',
                TheaterName: 'CGV강남',
                PlayYmd: '20260304',
                StartTime: '0930',
                EndTime: '1120',
                TotalSeat: '150',
                RemainSeat: '42',
              },
            ],
          },
        }),
      ),
    );

    const result = await fetchCgvTimetable({ playDate: '20260304' });

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe('09:30');
    expect(result[0].endTime).toBe('11:20');
    expect(result[0].totalSeats).toBe(150);
    expect(result[0].remainingSeats).toBe(42);
  });

  it('비정상 좌석 값은 0으로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH2',
                MovieCd: '200001',
                TheaterCd: '0056',
                StartTime: '9',
                EndTime: '',
                TotalSeat: 'abc',
                RemainSeat: undefined,
              },
            ],
          },
        }),
      ),
    );

    const result = await fetchCgvTimetable({ playDate: '20260304' });

    expect(result[0].startTime).toBe('9');
    expect(result[0].endTime).toBe('');
    expect(result[0].totalSeats).toBe(0);
    expect(result[0].remainingSeats).toBe(0);
  });
});

describe('toYyyymmdd', () => {
  it('Date를 YYYYMMDD로 변환한다', () => {
    const value = toYyyymmdd(new Date('2026-03-04T00:00:00.000Z'));
    expect(value).toBe('20260304');
  });
});
