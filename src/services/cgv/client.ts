/**
 * CGV API 클라이언트
 */

import { CGV_API } from './api.js';
import type {
  CgvMovie,
  CgvMovieListResponse,
  CgvTheater,
  CgvTheaterListResponse,
  CgvTimetable,
  CgvTimetableResponse,
} from './types.js';

interface CommonFetchParams {
  playDate?: string;
  theaterCode?: string;
  movieCode?: string;
  regionCode?: string;
  timeout?: number;
}

function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatTime(raw: string | undefined): string {
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

function createController(timeout: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}

async function postCgv<TResponse>(
  path: string,
  payload: Record<string, unknown>,
  timeout = 15000,
): Promise<TResponse> {
  const { controller, timeoutId } = createController(timeout);

  try {
    const response = await fetch(`${CGV_API.BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CGV API 호출 실패: ${response.status}`);
    }

    return (await response.json()) as TResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('CGV API 요청 시간 초과');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchCgvTheaters(params: CommonFetchParams): Promise<CgvTheater[]> {
  const response = await postCgv<CgvTheaterListResponse>(
    CGV_API.THEATER_LIST_PATH,
    {
      PlayYMD: params.playDate || toYyyymmdd(),
      AreaCd: params.regionCode || '',
    },
    params.timeout,
  );

  return (response.d?.TheaterList || [])
    .filter((item) => item.TheaterCd && item.TheaterName)
    .map((item) => ({
      theaterCode: item.TheaterCd as string,
      theaterName: item.TheaterName as string,
      regionCode: item.AreaCd || undefined,
    }));
}

export async function fetchCgvMovies(params: CommonFetchParams): Promise<CgvMovie[]> {
  const response = await postCgv<CgvMovieListResponse>(
    CGV_API.MOVIE_LIST_PATH,
    {
      PlayYMD: params.playDate || toYyyymmdd(),
      TheaterCd: params.theaterCode || '',
    },
    params.timeout,
  );

  return (response.d?.MovieList || [])
    .filter((item) => item.MovieCd && item.MovieName)
    .map((item) => ({
      movieCode: item.MovieCd as string,
      movieName: item.MovieName as string,
      rating: item.Grade || undefined,
    }));
}

export async function fetchCgvTimetable(params: CommonFetchParams): Promise<CgvTimetable[]> {
  const response = await postCgv<CgvTimetableResponse>(
    CGV_API.TIMETABLE_PATH,
    {
      PlayYMD: params.playDate || toYyyymmdd(),
      TheaterCd: params.theaterCode || '',
      MovieCd: params.movieCode || '',
    },
    params.timeout,
  );

  return (response.d?.TimeTableList || [])
    .filter((item) => item.ScheduleNo && item.MovieCd && item.TheaterCd)
    .map((item) => ({
      scheduleId: item.ScheduleNo as string,
      movieCode: item.MovieCd as string,
      movieName: item.MovieName || '',
      theaterCode: item.TheaterCd as string,
      theaterName: item.TheaterName || '',
      playDate: item.PlayYmd || params.playDate || toYyyymmdd(),
      startTime: formatTime(item.StartTime),
      endTime: formatTime(item.EndTime),
      totalSeats: toNumber(item.TotalSeat),
      remainingSeats: toNumber(item.RemainSeat),
    }));
}

export function toYyyymmdd(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}
