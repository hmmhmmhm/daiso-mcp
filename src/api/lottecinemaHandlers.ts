/**
 * 롯데시네마 GET API 핸들러
 */

import {
  fetchLotteCinemaNowShowing,
  toYyyymmdd,
} from '../services/lottecinema/client.js';
import {
  fetchLotteCinemaNearbyTheaters,
  resolveLotteCinemaNearestTheater,
} from '../services/lottecinema/location.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function handleLotteCinemaFindNearbyTheaters(c: ApiContext) {
  const keyword = c.req.query('keyword') || undefined;
  const latitude = parseOptionalNumber(c.req.query('lat'));
  const longitude = parseOptionalNumber(c.req.query('lng'));
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);

  try {
    const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number';
    const result = await fetchLotteCinemaNearbyTheaters(
      {
        keyword,
        latitude: hasCoordinates ? latitude : keyword ? undefined : 37.5665,
        longitude: hasCoordinates ? longitude : keyword ? undefined : 126.978,
        playDate,
        limit,
        timeout: timeoutMs,
      },
      {
        timeout: timeoutMs,
        googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
      },
    );

    return successResponse(c, result, { total: result.count, pageSize: limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTECINEMA_THEATER_SEARCH_FAILED', message, 500);
  }
}

export async function handleLotteCinemaListNowShowing(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  let theaterId = c.req.query('theaterId') || undefined;
  const movieId = c.req.query('movieId') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const latitude = parseOptionalNumber(c.req.query('lat'));
  const longitude = parseOptionalNumber(c.req.query('lng'));
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);

  try {
    let resolvedTheater = null;

    if (!theaterId && (keyword || typeof latitude === 'number' || typeof longitude === 'number')) {
      const resolved = await resolveLotteCinemaNearestTheater(
        {
          playDate,
          keyword,
          latitude,
          longitude,
          timeout: timeoutMs,
        },
        {
          timeout: timeoutMs,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        },
      );
      resolvedTheater = resolved.theater;
      theaterId = resolved.theater?.theaterId;
    }

    const shouldReturnEmpty =
      !theaterId && (keyword || typeof latitude === 'number' || typeof longitude === 'number');
    const { theaters, movies, showtimes } = shouldReturnEmpty
      ? { theaters: [], movies: [], showtimes: [] }
      : await fetchLotteCinemaNowShowing({
          playDate,
          theaterId,
          movieId,
          timeout: timeoutMs,
        });

    return successResponse(
      c,
      {
        playDate,
        filters: {
          theaterId: theaterId || null,
          movieId: movieId || null,
          keyword: keyword || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        },
        resolvedTheater,
        theaters,
        movies,
        showtimes,
      },
      { total: showtimes.length },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTECINEMA_MOVIE_LIST_FAILED', message, 500);
  }
}

export async function handleLotteCinemaGetRemainingSeats(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  let theaterId = c.req.query('theaterId') || undefined;
  const movieId = c.req.query('movieId') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const latitude = parseOptionalNumber(c.req.query('lat'));
  const longitude = parseOptionalNumber(c.req.query('lng'));
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);

  try {
    let resolvedTheater = null;

    if (!theaterId && (keyword || typeof latitude === 'number' || typeof longitude === 'number')) {
      const resolved = await resolveLotteCinemaNearestTheater(
        {
          playDate,
          keyword,
          latitude,
          longitude,
          timeout: timeoutMs,
        },
        {
          timeout: timeoutMs,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        },
      );
      resolvedTheater = resolved.theater;
      theaterId = resolved.theater?.theaterId;
    }

    const shouldReturnEmpty =
      !theaterId && (keyword || typeof latitude === 'number' || typeof longitude === 'number');
    const { showtimes } = shouldReturnEmpty
      ? { showtimes: [] }
      : await fetchLotteCinemaNowShowing({
          playDate,
          theaterId,
          movieId,
          timeout: timeoutMs,
        });

    const seats = showtimes
      .filter((item) => (theaterId ? item.theaterId === theaterId : true))
      .filter((item) => (movieId ? item.movieId === movieId : true))
      .sort((a, b) => {
        if (a.startTime === b.startTime) {
          return a.theaterName.localeCompare(b.theaterName);
        }
        return a.startTime.localeCompare(b.startTime);
      })
      .slice(0, limit);

    return successResponse(
      c,
      {
        playDate,
        filters: {
          theaterId: theaterId || null,
          movieId: movieId || null,
          keyword: keyword || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        },
        resolvedTheater,
        seats,
      },
      { total: seats.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTECINEMA_SEAT_LIST_FAILED', message, 500);
  }
}
