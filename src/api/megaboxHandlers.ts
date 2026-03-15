/**
 * 메가박스 GET API 핸들러
 */

import { fetchMegaboxBookingList, toYyyymmdd } from '../services/megabox/client.js';
import { fetchMegaboxNearbyTheaters, resolveMegaboxNearestTheater } from '../services/megabox/location.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 메가박스 주변 지점 조회 API 핸들러
 * GET /api/megabox/theaters?lat={위도}&lng={경도}&playDate={YYYYMMDD}&areaCode={지역코드}
 */
export async function handleMegaboxFindNearbyTheaters(c: ApiContext) {
  const keyword = c.req.query('keyword') || undefined;
  const lat = parseOptionalNumber(c.req.query('lat'));
  const lng = parseOptionalNumber(c.req.query('lng'));
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const areaCode = c.req.query('areaCode') || undefined;
  const limit = parseInt(c.req.query('limit') || '10');
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    const result = await fetchMegaboxNearbyTheaters(
      {
        keyword,
        latitude: lat,
        longitude: lng,
        playDate,
        areaCode,
        limit,
        timeout: timeoutMs,
      },
      {
        googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        timeout: timeoutMs,
      },
    );

    return successResponse(
      c,
      result,
      { total: result.count, pageSize: limit }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'MEGABOX_THEATER_SEARCH_FAILED', message, 500);
  }
}

/**
 * 메가박스 영화/회차 목록 조회 API 핸들러
 * GET /api/megabox/movies?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}
 */
export async function handleMegaboxListNowShowing(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const keyword = c.req.query('keyword') || undefined;
  const lat = parseOptionalNumber(c.req.query('lat'));
  const lng = parseOptionalNumber(c.req.query('lng'));
  let theaterId = c.req.query('theaterId') || undefined;
  const movieId = c.req.query('movieId') || undefined;
  const areaCode = c.req.query('areaCode') || undefined;
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    let resolvedTheater = null;
    let resolvedLocation = null;

    if (!theaterId && (keyword || typeof lat === 'number' || typeof lng === 'number')) {
      const resolved = await resolveMegaboxNearestTheater(
        {
          keyword,
          latitude: lat,
          longitude: lng,
          areaCode,
          playDate,
          timeout: timeoutMs,
        },
        {
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
          timeout: timeoutMs,
        },
      );
      theaterId = resolved.theater?.theaterId;
      resolvedTheater = resolved.theater;
      resolvedLocation = resolved.location;
    }

    const resolvedAreaCode = resolvedLocation?.areaCode || areaCode || '11';
    const result = await fetchMegaboxBookingList({
      playDate,
      theaterId,
      movieId,
      areaCode: resolvedAreaCode,
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
          latitude: lat ?? null,
          longitude: lng ?? null,
          areaCode: resolvedAreaCode,
        },
        resolvedTheater,
        theaters: result.theaters,
        movies: result.movies,
        showtimes: result.showtimes,
      },
      { total: result.showtimes.length }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'MEGABOX_MOVIE_LIST_FAILED', message, 500);
  }
}

/**
 * 메가박스 잔여 좌석 조회 API 핸들러
 * GET /api/megabox/seats?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}
 */
export async function handleMegaboxGetRemainingSeats(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const keyword = c.req.query('keyword') || undefined;
  const lat = parseOptionalNumber(c.req.query('lat'));
  const lng = parseOptionalNumber(c.req.query('lng'));
  let theaterId = c.req.query('theaterId') || undefined;
  const movieId = c.req.query('movieId') || undefined;
  const areaCode = c.req.query('areaCode') || undefined;
  const limit = parseInt(c.req.query('limit') || '50');
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    let resolvedTheater = null;
    let resolvedLocation = null;

    if (!theaterId && (keyword || typeof lat === 'number' || typeof lng === 'number')) {
      const resolved = await resolveMegaboxNearestTheater(
        {
          keyword,
          latitude: lat,
          longitude: lng,
          areaCode,
          playDate,
          timeout: timeoutMs,
        },
        {
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
          timeout: timeoutMs,
        },
      );
      theaterId = resolved.theater?.theaterId;
      resolvedTheater = resolved.theater;
      resolvedLocation = resolved.location;
    }

    const resolvedAreaCode = resolvedLocation?.areaCode || areaCode || '11';
    const { showtimes } = await fetchMegaboxBookingList({
      playDate,
      theaterId,
      movieId,
      areaCode: resolvedAreaCode,
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
          latitude: lat ?? null,
          longitude: lng ?? null,
          areaCode: resolvedAreaCode,
        },
        resolvedTheater,
        seats,
      },
      { total: seats.length, pageSize: limit }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'MEGABOX_SEAT_LIST_FAILED', message, 500);
  }
}
