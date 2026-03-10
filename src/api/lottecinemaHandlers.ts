/**
 * 롯데시네마 GET API 핸들러
 */

import {
  fetchLotteCinemaNowShowing,
  fetchLotteCinemaTicketingPage,
  toYyyymmdd,
} from '../services/lottecinema/client.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export async function handleLotteCinemaFindNearbyTheaters(c: ApiContext) {
  const lat = parseFloat(c.req.query('lat') || '37.5665');
  const lng = parseFloat(c.req.query('lng') || '126.978');
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);

  try {
    const { theaters } = await fetchLotteCinemaTicketingPage(timeoutMs);
    const nearby = theaters
      .filter((theater) => theater.latitude !== null && theater.longitude !== null)
      .map((theater) => ({
        ...theater,
        distanceKm: Number(
          calculateDistanceKm(lat, lng, theater.latitude as number, theater.longitude as number).toFixed(2),
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return successResponse(
      c,
      {
        location: { latitude: lat, longitude: lng },
        playDate,
        theaters: nearby,
      },
      { total: nearby.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTECINEMA_THEATER_SEARCH_FAILED', message, 500);
  }
}

export async function handleLotteCinemaListNowShowing(c: ApiContext) {
  const playDate = c.req.query('playDate') || toYyyymmdd();
  const theaterId = c.req.query('theaterId') || undefined;
  const movieId = c.req.query('movieId') || undefined;
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);

  try {
    const { theaters, movies, showtimes } = await fetchLotteCinemaNowShowing({
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
        },
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
  const theaterId = c.req.query('theaterId') || undefined;
  const movieId = c.req.query('movieId') || undefined;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '15000', 10);

  try {
    const { showtimes } = await fetchLotteCinemaNowShowing({
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
        },
        seats,
      },
      { total: seats.length, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTECINEMA_SEAT_LIST_FAILED', message, 500);
  }
}
