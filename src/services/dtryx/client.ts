/**
 * 디트릭스 API 클라이언트
 */

import { formatTime, toNumber, toYyyymmdd } from '../../utils/format.js';
import { createTimeoutController } from '../../utils/http.js';
import { DTRYX_API } from './api.js';
import type {
  DtryxMovie,
  DtryxMovieResponse,
  DtryxPlayDate,
  DtryxPlayDateResponse,
  DtryxShowtime,
  DtryxTimetableResponse,
} from './types.js';

export interface DtryxRequestParams {
  brandCode: string;
  cinemaCode: string;
  playDate?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * 디트릭스는 `PlaySDT` 를 `YYYY-MM-DD` 로만 받습니다.
 * `YYYYMMDD` 로 보내면 오류 없이 `RecordCount: 0` 이 반환되므로 항상 변환합니다.
 */
export function toDashedDate(playDate: string): string {
  if (/^\d{8}$/.test(playDate)) {
    return `${playDate.slice(0, 4)}-${playDate.slice(4, 6)}-${playDate.slice(6, 8)}`;
  }

  return playDate;
}

/** 출력용으로 `YYYYMMDD` 형태로 되돌립니다. */
export function toCompactDate(playDate: string): string {
  return playDate.replace(/-/g, '');
}

async function requestDtryx<T>(
  endpoint: string,
  workGuid: string,
  params: Record<string, string>,
  timeout = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const { controller, timeoutId } = createTimeoutController(timeout);
  const query = new URLSearchParams({
    ChannelCd: DTRYX_API.CHANNEL_CODE,
    EngVerYn: 'N',
    WorkGuID: workGuid,
    ...params,
  });
  const url = `${DTRYX_API.BASE_URL}${DTRYX_API.THIRDPARTY_PATH}/${endpoint}?${query.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`디트릭스 API 호출 실패: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('디트릭스 API 호출 시간 초과');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildScheduleId(
  cinemaCode: string,
  playDate: string,
  screenCode: string,
  showSeq: string,
): string {
  return `${playDate}-${cinemaCode}-${screenCode}-${showSeq}`;
}

/** 상영 회차와 좌석 현황을 조회합니다. */
export async function fetchDtryxTimetable(params: DtryxRequestParams): Promise<DtryxShowtime[]> {
  const playDate = params.playDate || toYyyymmdd();
  const response = await requestDtryx<DtryxTimetableResponse>(
    DTRYX_API.ENDPOINTS.TIMETABLE_LIST,
    DTRYX_API.WORK_GUIDS.TIMETABLE_LIST,
    {
      BrandCd: params.brandCode,
      CinemaCd: params.cinemaCode,
      PlaySDT: toDashedDate(playDate),
      ImgSize: 'small',
    },
    params.timeout,
  );

  return (response.Recordset || [])
    .filter((item) => item.CinemaCd && item.MovieCd && item.ScreenCd)
    .map((item) => {
      const totalSeats = toNumber(item.TotalSeatCnt);
      const remainingSeats = toNumber(item.RemainSeatCnt);
      const compactDate = toCompactDate(item.PlaySDT || playDate);
      const cinemaCode = String(item.CinemaCd);
      const screenCode = String(item.ScreenCd);
      const showSeq = String(item.ShowSeq ?? '');

      return {
        scheduleId: buildScheduleId(cinemaCode, compactDate, screenCode, showSeq),
        brandCode: params.brandCode,
        cinemaCode,
        cinemaName: item.CinemaNm || '',
        screenCode,
        screenName: item.ScreenNm || '',
        movieCode: String(item.MovieCd),
        movieName: item.MovieNm || '',
        playDate: compactDate,
        startTime: formatTime(item.StartTime),
        endTime: formatTime(item.EndTime),
        runningMinutes: toNumber(item.RunningTime),
        rating: item.RatingNm || '',
        totalSeats,
        remainingSeats,
        bookedSeats: Math.max(totalSeats - remainingSeats, 0),
        planStatus: item.PlanStatus || '',
      };
    });
}

/** 예매 가능한 상영 날짜를 조회합니다. */
export async function fetchDtryxPlayDates(
  params: Omit<DtryxRequestParams, 'playDate'>,
): Promise<DtryxPlayDate[]> {
  const response = await requestDtryx<DtryxPlayDateResponse>(
    DTRYX_API.ENDPOINTS.PLAY_DATE_LIST,
    DTRYX_API.WORK_GUIDS.PLAY_DATE_LIST,
    {
      BrandCd: params.brandCode,
      CinemaCd: params.cinemaCode,
      MovieCd: '',
    },
    params.timeout,
  );

  return (response.Recordset || [])
    .filter((item) => item.PlaySDT)
    .map((item) => ({
      playDate: toCompactDate(item.PlaySDT as string),
      hidden: item.HiddenYn === 'Y',
      rest: item.RestYn === 'Y',
    }));
}

/** 현재 상영작 목록을 조회합니다. */
export async function fetchDtryxNowShowing(
  params: Omit<DtryxRequestParams, 'playDate'>,
): Promise<DtryxMovie[]> {
  const response = await requestDtryx<DtryxMovieResponse>(
    DTRYX_API.ENDPOINTS.MOVIE_NOW,
    DTRYX_API.WORK_GUIDS.MOVIE_NOW,
    {
      BrandCd: params.brandCode,
      CinemaCd: params.cinemaCode,
      ImgSize: 'small',
    },
    params.timeout,
  );

  return (response.Recordset || [])
    .filter((item) => item.MovieCd && item.MovieNm)
    .map((item) => ({
      movieCode: String(item.MovieCd),
      movieName: item.MovieNm as string,
      rating: item.RatingNm || undefined,
      runningMinutes:
        item.RunningTime === null || item.RunningTime === undefined
          ? undefined
          : toNumber(item.RunningTime),
    }));
}

export { toYyyymmdd };
