/**
 * 디트릭스 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDtryxNowShowing,
  fetchDtryxPlayDates,
  fetchDtryxTimetable,
  toCompactDate,
  toDashedDate,
} from '../../../src/services/dtryx/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('디트릭스 날짜 변환', () => {
  it('YYYYMMDD 를 대시 형식으로 바꾼다', () => {
    expect(toDashedDate('20260820')).toBe('2026-08-20');
  });

  it('이미 대시 형식이면 그대로 둔다', () => {
    expect(toDashedDate('2026-08-20')).toBe('2026-08-20');
  });

  it('대시를 제거해 compact 형식으로 되돌린다', () => {
    expect(toCompactDate('2026-08-20')).toBe('20260820');
  });
});

describe('fetchDtryxTimetable', () => {
  it('상영 회차와 좌석 수를 변환한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        RetMsg: '정상 완료',
        RecordCount: 1,
        Recordset: [
          {
            CinemaCd: '000067',
            CinemaNm: '아트하우스모모',
            ScreenCd: '02',
            ScreenNm: '2관',
            PlaySDT: '2026-08-20',
            ShowSeq: 3,
            PlanStatus: 'confirm',
            StartTime: '13:30',
            EndTime: '15:13',
            MovieCd: '027030',
            MovieNm: '콘크리트 녹색섬',
            RunningTime: '103',
            RatingNm: '전체관람가',
            TotalSeatCnt: 138,
            RemainSeatCnt: 128,
          },
        ],
      }),
    );

    const showtimes = await fetchDtryxTimetable({
      brandCode: 'indieart',
      cinemaCode: '000067',
      playDate: '20260820',
    });

    expect(showtimes).toHaveLength(1);
    expect(showtimes[0]).toMatchObject({
      scheduleId: '20260820-000067-02-3',
      brandCode: 'indieart',
      cinemaName: '아트하우스모모',
      screenName: '2관',
      movieName: '콘크리트 녹색섬',
      playDate: '20260820',
      startTime: '13:30',
      totalSeats: 138,
      remainingSeats: 128,
      bookedSeats: 10,
    });
  });

  it('PlaySDT 를 대시 형식으로 요청한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    await fetchDtryxTimetable({
      brandCode: 'indieart',
      cinemaCode: '000067',
      playDate: '20260820',
    });

    const requestedUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('PlaySDT=2026-08-20');
    expect(requestedUrl).not.toContain('PlaySDT=20260820');
  });

  it('잔여가 총좌석보다 크면 예매 수를 0 으로 둔다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        Recordset: [
          {
            CinemaCd: '000067',
            ScreenCd: '01',
            MovieCd: '1',
            PlaySDT: '2026-08-20',
            TotalSeatCnt: 10,
            RemainSeatCnt: 20,
          },
        ],
      }),
    );

    const showtimes = await fetchDtryxTimetable({
      brandCode: 'indieart',
      cinemaCode: '000067',
      playDate: '20260820',
    });

    expect(showtimes[0]?.bookedSeats).toBe(0);
  });

  it('필수 코드가 없는 항목은 제외한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [{ CinemaNm: '이름만 있는 항목' }] }));

    const showtimes = await fetchDtryxTimetable({
      brandCode: 'indieart',
      cinemaCode: '000067',
      playDate: '20260820',
    });

    expect(showtimes).toEqual([]);
  });

  it('HTTP 오류는 상태 코드를 담아 던진다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 503));

    await expect(
      fetchDtryxTimetable({ brandCode: 'indieart', cinemaCode: '000067' }),
    ).rejects.toThrow('디트릭스 API 호출 실패: 503');
  });

  it('요청이 취소되면 시간 초과로 알린다', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    await expect(
      fetchDtryxTimetable({ brandCode: 'indieart', cinemaCode: '000067' }),
    ).rejects.toThrow('디트릭스 API 호출 시간 초과');
  });
});

describe('fetchDtryxPlayDates', () => {
  it('상영 날짜와 휴관 여부를 변환한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        Recordset: [
          { PlaySDT: '2026-08-20', HiddenYn: 'N', RestYn: 'N' },
          { PlaySDT: '2026-08-22', HiddenYn: 'N', RestYn: 'Y' },
          { HiddenYn: 'N' },
        ],
      }),
    );

    const dates = await fetchDtryxPlayDates({ brandCode: 'indieart', cinemaCode: '000067' });

    expect(dates).toEqual([
      { playDate: '20260820', hidden: false, rest: false },
      { playDate: '20260822', hidden: false, rest: true },
    ]);
  });
});

describe('fetchDtryxNowShowing', () => {
  it('상영작을 변환하고 코드 없는 항목은 제외한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        Recordset: [
          {
            MovieCd: '027030',
            MovieNm: '콘크리트 녹색섬',
            RatingNm: '전체관람가',
            RunningTime: '103',
          },
          { MovieNm: '코드 없는 영화' },
        ],
      }),
    );

    const movies = await fetchDtryxNowShowing({ brandCode: 'indieart', cinemaCode: '000067' });

    expect(movies).toEqual([
      {
        movieCode: '027030',
        movieName: '콘크리트 녹색섬',
        rating: '전체관람가',
        runningMinutes: 103,
      },
    ]);
  });
});
