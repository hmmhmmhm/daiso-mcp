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

  it('요청 timeout 시 AbortController로 중단한다', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation((_, init?: { signal?: AbortSignal }) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const request = fetchCgvTheaters({ timeout: 1 });
    const assertion = expect(request).rejects.toThrow('CGV API 요청 시간 초과');
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    vi.useRealTimers();
  });

  it('지역 코드가 없으면 undefined로 정규화한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TheaterList: [{ TheaterCd: '0056', TheaterName: 'CGV강남' }],
          },
        }),
      ),
    );

    const result = await fetchCgvTheaters({});
    expect(result[0].regionCode).toBeUndefined();
  });

  it('극장 목록이 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ d: {} })));

    const result = await fetchCgvTheaters({});
    expect(result).toEqual([]);
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

  it('등급 정보가 없으면 rating을 undefined로 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            MovieList: [{ MovieCd: '200001', MovieName: '테스트 영화' }],
          },
        }),
      ),
    );

    const result = await fetchCgvMovies({});
    expect(result[0].rating).toBeUndefined();
  });

  it('영화 목록이 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ d: {} })));

    const result = await fetchCgvMovies({});
    expect(result).toEqual([]);
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

  it('이미 HH:mm 형식인 시간은 그대로 유지한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH3',
                MovieCd: '200001',
                TheaterCd: '0056',
                StartTime: '09:30',
                EndTime: '11:20',
                TotalSeat: 100,
                RemainSeat: 50,
              },
            ],
          },
        }),
      ),
    );

    const result = await fetchCgvTimetable({ playDate: '20260304' });
    expect(result[0].startTime).toBe('09:30');
    expect(result[0].endTime).toBe('11:20');
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

  it('PlayYmd와 조회일자가 모두 없으면 오늘 날짜를 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TimeTableList: [
              {
                ScheduleNo: 'SCH4',
                MovieCd: '200003',
                TheaterCd: '0056',
                StartTime: '1010',
                EndTime: '1210',
                TotalSeat: 80,
                RemainSeat: 20,
              },
            ],
          },
        }),
      ),
    );

    const result = await fetchCgvTimetable({});
    expect(result[0].playDate).toBe(toYyyymmdd());
  });

  it('시간표 목록이 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ d: {} })));

    const result = await fetchCgvTimetable({});
    expect(result).toEqual([]);
  });
});

describe('toYyyymmdd', () => {
  it('Date를 YYYYMMDD로 변환한다', () => {
    const value = toYyyymmdd(new Date('2026-03-04T00:00:00.000Z'));
    expect(value).toBe('20260304');
  });
});
