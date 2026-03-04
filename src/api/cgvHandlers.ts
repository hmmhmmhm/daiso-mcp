/**
 * CGV GET API 핸들러
 */

import { fetchCgvMovies, fetchCgvTheaters, fetchCgvTimetable, toYyyymmdd } from '../services/cgv/client.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

/**
 * CGV 극장 목록 조회 API 핸들러
 * GET /api/cgv/theaters?playDate={YYYYMMDD}&regionCode={지역코드}
 */
export async function handleCgvFindTheaters(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const regionCode = c.req.query('regionCode') || undefined;
  const limit = parseInt(c.req.query('limit') || '30');
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    const theaters = await fetchCgvTheaters({
      playDate,
      regionCode,
      timeout: timeoutMs,
    });

    const sliced = theaters.slice(0, limit);

    return successResponse(
      c,
      {
        playDate,
        filters: {
          regionCode: regionCode || null,
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
  const theaterCode = c.req.query('theaterCode') || undefined;
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    const movies = await fetchCgvMovies({
      playDate,
      theaterCode,
      timeout: timeoutMs,
    });

    return successResponse(
      c,
      {
        playDate,
        filters: {
          theaterCode: theaterCode || null,
        },
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
  const theaterCode = c.req.query('theaterCode') || undefined;
  const movieCode = c.req.query('movieCode') || undefined;
  const limit = parseInt(c.req.query('limit') || '50');
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000');

  try {
    const timetable = await fetchCgvTimetable({
      playDate,
      theaterCode,
      movieCode,
      timeout: timeoutMs,
    });

    const filtered = timetable
      .filter((item) => (theaterCode ? item.theaterCode === theaterCode : true))
      .filter((item) => (movieCode ? item.movieCode === movieCode : true))
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
          theaterCode: theaterCode || null,
          movieCode: movieCode || null,
        },
        timetable: filtered,
      },
      { total: filtered.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'CGV_TIMETABLE_FETCH_FAILED', message, 500);
  }
}
