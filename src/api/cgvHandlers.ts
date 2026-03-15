/**
 * CGV GET API 핸들러
 */

import { fetchCgvMovies, fetchCgvTheaters, fetchCgvTimetable, toYyyymmdd } from '../services/cgv/client.js';
import { fetchCgvNearbyTheaters, resolveCgvNearestTheater } from '../services/cgv/location.js';
import { filterAndSortTimetable } from '../services/cgv/timetable.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * CGV 극장 목록 조회 API 핸들러
 * GET /api/cgv/theaters?playDate={YYYYMMDD}&regionCode={지역코드}
 */
export async function handleCgvFindTheaters(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const regionCode = c.req.query('regionCode') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const latitude = parseOptionalNumber(c.req.query('lat'));
  const longitude = parseOptionalNumber(c.req.query('lng'));
  const limit = parseInt(c.req.query('limit') || '30');
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    if (keyword || typeof latitude === 'number' || typeof longitude === 'number') {
      const result = await fetchCgvNearbyTheaters(
        {
          playDate,
          regionCode,
          keyword,
          latitude,
          longitude,
          limit,
          timeout: timeoutMs,
        },
        {
          timeout: timeoutMs,
          zyteApiKey: c.env?.ZYTE_API_KEY,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        },
      );

      return successResponse(c, result, { total: result.count, pageSize: limit });
    }

    const theaters = await fetchCgvTheaters({
      playDate,
      regionCode,
      timeout: timeoutMs,
      zyteApiKey: c.env?.ZYTE_API_KEY,
    });

    const sliced = theaters.slice(0, limit);

    return successResponse(
      c,
      {
        playDate,
        filters: {
          regionCode: regionCode || null,
          keyword: keyword || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        },
        theaters: sliced,
      },
      { total: sliced.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'CGV_THEATER_SEARCH_FAILED', message, 500);
  }
}

/**
 * CGV 영화 목록 조회 API 핸들러
 * GET /api/cgv/movies?playDate={YYYYMMDD}&theaterCode={극장코드}
 */
export async function handleCgvSearchMovies(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  let theaterCode = c.req.query('theaterCode') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const latitude = parseOptionalNumber(c.req.query('lat'));
  const longitude = parseOptionalNumber(c.req.query('lng'));
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    let resolvedTheater = null;

    if (!theaterCode && (keyword || typeof latitude === 'number' || typeof longitude === 'number')) {
      const resolved = await resolveCgvNearestTheater(
        {
          playDate,
          keyword,
          latitude,
          longitude,
          timeout: timeoutMs,
        },
        {
          timeout: timeoutMs,
          zyteApiKey: c.env?.ZYTE_API_KEY,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        },
      );
      resolvedTheater = resolved.theater;
      theaterCode = resolved.theater?.theaterCode;
    }

    const shouldReturnEmpty =
      !theaterCode && (keyword || typeof latitude === 'number' || typeof longitude === 'number');
    const movies = shouldReturnEmpty
      ? []
      : await fetchCgvMovies({
          playDate,
          theaterCode,
          timeout: timeoutMs,
          zyteApiKey: c.env?.ZYTE_API_KEY,
        });

    return successResponse(
      c,
      {
        playDate,
        filters: {
          theaterCode: theaterCode || null,
          keyword: keyword || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        },
        resolvedTheater,
        movies,
      },
      { total: movies.length },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'CGV_MOVIE_SEARCH_FAILED', message, 500);
  }
}

/**
 * CGV 시간표 조회 API 핸들러
 * GET /api/cgv/timetable?playDate={YYYYMMDD}&theaterCode={극장코드}&movieCode={영화코드}
 */
export async function handleCgvGetTimetable(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  let theaterCode = c.req.query('theaterCode') || undefined;
  const movieCode = c.req.query('movieCode') || undefined;
  const keyword = c.req.query('keyword') || undefined;
  const latitude = parseOptionalNumber(c.req.query('lat'));
  const longitude = parseOptionalNumber(c.req.query('lng'));
  const limit = parseInt(c.req.query('limit') || '50');
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    let resolvedTheater = null;

    if (!theaterCode && (keyword || typeof latitude === 'number' || typeof longitude === 'number')) {
      const resolved = await resolveCgvNearestTheater(
        {
          playDate,
          keyword,
          latitude,
          longitude,
          timeout: timeoutMs,
        },
        {
          timeout: timeoutMs,
          zyteApiKey: c.env?.ZYTE_API_KEY,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        },
      );
      resolvedTheater = resolved.theater;
      theaterCode = resolved.theater?.theaterCode;
    }

    const shouldReturnEmpty =
      !theaterCode && (keyword || typeof latitude === 'number' || typeof longitude === 'number');
    const timetable = shouldReturnEmpty
      ? []
      : await fetchCgvTimetable({
          playDate,
          theaterCode,
          movieCode,
          timeout: timeoutMs,
          zyteApiKey: c.env?.ZYTE_API_KEY,
        });

    const filtered = filterAndSortTimetable(timetable, { theaterCode, movieCode, limit });

    return successResponse(
      c,
      {
        playDate,
        filters: {
          theaterCode: theaterCode || null,
          movieCode: movieCode || null,
          keyword: keyword || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        },
        resolvedTheater,
        timetable: filtered,
      },
      { total: filtered.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'CGV_TIMETABLE_FETCH_FAILED', message, 500);
  }
}
