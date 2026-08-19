/**
 * 디트릭스 GET API 핸들러
 */

import {
  DTRYX_CINEMAS,
  findCinemaByCode,
  findCinemasByKeyword,
} from '../services/dtryx/catalog.js';
import {
  fetchDtryxNowShowing,
  fetchDtryxPlayDates,
  fetchDtryxTimetable,
  toYyyymmdd,
} from '../services/dtryx/client.js';
import type { DtryxCinema } from '../services/dtryx/types.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

/** 요청 파라미터로 조회 대상 극장을 결정합니다. */
function resolveCinemas(
  cinemaCode: string | undefined,
  keyword: string | undefined,
  brandCode: string | undefined,
): DtryxCinema[] {
  if (cinemaCode) {
    const known = findCinemaByCode(cinemaCode);
    if (known) {
      return [known];
    }

    return brandCode ? [{ brandCode, cinemaCode, cinemaName: '' }] : [];
  }

  if (keyword) {
    return findCinemasByKeyword(keyword);
  }

  return [...DTRYX_CINEMAS];
}

export async function handleDtryxListCinemas(c: ApiContext) {
  const keyword = c.req.query('keyword') || undefined;
  const brandCode = c.req.query('brandCode') || undefined;
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const cinemas = (keyword ? findCinemasByKeyword(keyword) : [...DTRYX_CINEMAS])
    .filter((cinema) => (brandCode ? cinema.brandCode === brandCode : true))
    .slice(0, limit);

  return successResponse(
    c,
    {
      filters: { keyword: keyword || null, brandCode: brandCode || null, limit },
      count: cinemas.length,
      cinemas,
    },
    { total: cinemas.length, pageSize: limit },
  );
}

export async function handleDtryxListNowShowing(c: ApiContext) {
  const cinemaCode = c.req.query('cinemaCode') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const brandCode = c.req.query('brandCode') || undefined;
  const includePlayDates = c.req.query('includePlayDates') === 'true';
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);
  const cinema = resolveCinemas(cinemaCode, keyword, brandCode)[0];

  if (!cinema) {
    return errorResponse(
      c,
      'DTRYX_CINEMA_NOT_FOUND',
      '극장을 찾을 수 없습니다. cinemaCode 또는 keyword 를 확인하세요.',
      404,
    );
  }

  try {
    const request = {
      brandCode: cinema.brandCode,
      cinemaCode: cinema.cinemaCode,
      timeout: timeoutMs,
    };
    const [movies, playDates] = await Promise.all([
      fetchDtryxNowShowing(request),
      includePlayDates ? fetchDtryxPlayDates(request) : Promise.resolve([]),
    ]);

    return successResponse(
      c,
      {
        cinema,
        count: movies.length,
        movies,
        playDates: includePlayDates ? playDates : undefined,
      },
      { total: movies.length },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'DTRYX_NOW_SHOWING_FAILED', message, 500);
  }
}

export async function handleDtryxGetRemainingSeats(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const cinemaCode = c.req.query('cinemaCode') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const brandCode = c.req.query('brandCode') || undefined;
  const movieName = c.req.query('movieName') || undefined;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);
  const cinemas = resolveCinemas(cinemaCode, keyword, brandCode);

  if (cinemas.length === 0) {
    return errorResponse(
      c,
      'DTRYX_CINEMA_NOT_FOUND',
      '극장을 찾을 수 없습니다. cinemaCode 또는 keyword 를 확인하세요.',
      404,
    );
  }

  try {
    const settled = await Promise.allSettled(
      cinemas.map((cinema) =>
        fetchDtryxTimetable({
          brandCode: cinema.brandCode,
          cinemaCode: cinema.cinemaCode,
          playDate,
          timeout: timeoutMs,
        }),
      ),
    );
    const failedCinemas = cinemas
      .filter((_, index) => settled[index]?.status === 'rejected')
      .map((cinema) => cinema.cinemaName || cinema.cinemaCode);
    const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();
    const showtimes = settled
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((item) =>
        movieName ? normalize(item.movieName).includes(normalize(movieName)) : true,
      )
      .sort((a, b) =>
        a.startTime === b.startTime
          ? a.cinemaName.localeCompare(b.cinemaName)
          : a.startTime.localeCompare(b.startTime),
      )
      .slice(0, limit);

    return successResponse(
      c,
      {
        playDate,
        filters: {
          cinemaCode: cinemaCode || null,
          keyword: keyword || null,
          movieName: movieName || null,
        },
        searchedCinemaCount: cinemas.length,
        failedCinemas,
        count: showtimes.length,
        showtimes,
      },
      { total: showtimes.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'DTRYX_SEATS_FETCH_FAILED', message, 500);
  }
}
