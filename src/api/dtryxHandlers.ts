/**
 * 디트릭스 GET API 핸들러
 */

import { ServiceError } from '../core/errors.js';
import { dtryxTransportFromBindings } from '../services/dtryx/transport.js';

import { resolveDtryxCinemas } from '../services/dtryx/location.js';
import { DTRYX_INVALID_INPUT, hasInvalidDtryxOptions } from '../services/dtryx/validation.js';
import {
  fetchDtryxNowShowing,
  fetchDtryxPlayDates,
  fetchDtryxTimetable,
  toYyyymmdd,
} from '../services/dtryx/client.js';
import {
  type ApiContext,
  errorResponse,
  serviceErrorResponse,
  successResponse,
} from './response.js';

export async function handleDtryxListCinemas(c: ApiContext) {
  const keyword = c.req.query('keyword') || undefined;
  const region = c.req.query('region') || undefined;
  const brandCode = c.req.query('brandCode') || undefined;
  const limit = Number(c.req.query('limit') ?? '50');
  if (hasInvalidDtryxOptions({ limit })) {
    return errorResponse(c, 'DTRYX_INVALID_INPUT', DTRYX_INVALID_INPUT, 400);
  }
  const cinemas = resolveDtryxCinemas({ keyword, region, brandCode }).slice(0, limit);

  return successResponse(
    c,
    {
      filters: {
        keyword: keyword || null,
        region: region || null,
        brandCode: brandCode || null,
        limit,
      },
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
  const timeoutMs = Number(c.req.query('timeoutMs') ?? '15000');
  if (hasInvalidDtryxOptions({ timeoutMs })) {
    return errorResponse(c, 'DTRYX_INVALID_INPUT', DTRYX_INVALID_INPUT, 400);
  }
  const cinema =
    cinemaCode || keyword ? resolveDtryxCinemas({ cinemaCode, keyword, brandCode })[0] : undefined;

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
      fetchDtryxNowShowing(request, dtryxTransportFromBindings(c.env)),
      includePlayDates
        ? fetchDtryxPlayDates(request, dtryxTransportFromBindings(c.env))
        : Promise.resolve([]),
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
    if (error instanceof ServiceError) return serviceErrorResponse(c, error, 'now_showing');
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
  const region = c.req.query('region') || undefined;
  const limit = Number(c.req.query('limit') ?? '50');
  const timeoutMs = Number(c.req.query('timeoutMs') ?? '15000');
  if (hasInvalidDtryxOptions({ limit, timeoutMs, playDate })) {
    return errorResponse(c, 'DTRYX_INVALID_INPUT', DTRYX_INVALID_INPUT, 400);
  }
  const cinemas = resolveDtryxCinemas({ cinemaCode, keyword, brandCode, region });

  if (cinemas.length === 0) {
    return errorResponse(
      c,
      'DTRYX_CINEMA_NOT_FOUND',
      '극장을 찾을 수 없습니다. cinemaCode 또는 keyword 를 확인하세요.',
      404,
    );
  }

  // Promise.allSettled 로 극장별 실패를 흡수하므로 여기서 예외가 전파되지 않습니다.
  const settled = await Promise.allSettled(
    cinemas.map((cinema) =>
      fetchDtryxTimetable(
        {
          brandCode: cinema.brandCode,
          cinemaCode: cinema.cinemaCode,
          playDate,
          timeout: timeoutMs,
        },
        dtryxTransportFromBindings(c.env),
      ),
    ),
  );
  const failedCinemas = cinemas
    .filter((_, index) => settled[index]?.status === 'rejected')
    .map((cinema) => cinema.cinemaName || cinema.cinemaCode);
  if (failedCinemas.length === cinemas.length) {
    return errorResponse(
      c,
      'DTRYX_SEATS_FAILED',
      `모든 극장 조회에 실패했습니다: ${failedCinemas.join(', ')}`,
      503,
    );
  }
  const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  const showtimes = settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((item) => (movieName ? normalize(item.movieName).includes(normalize(movieName)) : true))
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
        region: region || null,
        movieName: movieName || null,
      },
      searchedCinemaCount: cinemas.length,
      failedCinemas,
      count: showtimes.length,
      showtimes,
    },
    { total: showtimes.length, pageSize: limit },
  );
}
