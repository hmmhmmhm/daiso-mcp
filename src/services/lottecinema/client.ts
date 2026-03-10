/**
 * 롯데시네마 API 클라이언트
 */

import { formatTime, toNumber, toYyyymmdd } from '../../utils/format.js';
import { createTimeoutController } from '../../utils/http.js';
import { LOTTECINEMA_API } from './api.js';
import type {
  LotteCinemaMovie,
  LotteCinemaPlaySequenceResponse,
  LotteCinemaShowtime,
  LotteCinemaTheater,
  LotteCinemaTicketingPageResponse,
} from './types.js';

interface CommonFetchParams {
  playDate?: string;
  theaterId?: string;
  movieId?: string;
  timeout?: number;
}

const DEFAULT_OS_VERSION =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

function normalizeDateForRequest(playDate: string): string {
  if (/^\d{8}$/.test(playDate)) {
    return `${playDate.slice(0, 4)}-${playDate.slice(4, 6)}-${playDate.slice(6, 8)}`;
  }

  return playDate;
}

function normalizeDateForOutput(playDate: string): string {
  return playDate.replace(/-/g, '');
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRequestPayload(methodName: string, fields: Record<string, unknown>): Record<string, unknown> {
  return {
    MethodName: methodName,
    channelType: 'HO',
    osType: 'W',
    osVersion: DEFAULT_OS_VERSION,
    ...fields,
  };
}

async function requestLotteCinema<T>(
  methodName: string,
  fields: Record<string, unknown>,
  timeout = 15000,
): Promise<T> {
  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    const body = new FormData();
    body.append('paramList', JSON.stringify(buildRequestPayload(methodName, fields)));

    const response = await fetch(`${LOTTECINEMA_API.BASE_URL}${LOTTECINEMA_API.TICKETING_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`롯데시네마 API 호출 실패: ${response.status}`);
    }

    const parsed = (await response.json()) as { IsOK?: boolean; ResultMessage?: string } & T;
    if (parsed.IsOK === false) {
      throw new Error(`롯데시네마 API 응답 실패: ${parsed.ResultMessage || 'UNKNOWN'}`);
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('롯데시네마 API 호출 시간 초과');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildCompositeCinemaId(theater: LotteCinemaTheater): string {
  return `${theater.regionCode}|${theater.regionDetailCode}|${theater.theaterId}`;
}

function buildScheduleId(playDate: string, theaterId: string, screenId: string, playSequence: string): string {
  return `${playDate}-${theaterId}-${screenId}-${playSequence}`;
}

export async function fetchLotteCinemaTicketingPage(
  timeout = 15000,
): Promise<{ theaters: LotteCinemaTheater[]; movies: LotteCinemaMovie[] }> {
  const response = await requestLotteCinema<LotteCinemaTicketingPageResponse>(
    LOTTECINEMA_API.METHODS.GET_TICKETING_PAGE,
    {
      memberOnNo: '0',
    },
    timeout,
  );

  const theaters = (response.Cinemas?.Cinemas?.Items || [])
    .filter((item) => item.CinemaID && item.CinemaNameKR && item.DivisionCode && item.DetailDivisionCode)
    .map((item) => ({
      theaterId: String(item.CinemaID),
      theaterName: item.CinemaNameKR as string,
      regionCode: String(item.DivisionCode),
      regionDetailCode: String(item.DetailDivisionCode),
      latitude: toNullableNumber(item.Latitude),
      longitude: toNullableNumber(item.Longitude),
      address: item.CinemaAddrSummary || '',
    }));

  const movies = (response.Movies?.Movies?.Items || [])
    .filter((item) => item.RepresentationMovieCode && item.MovieNameKR)
    .map((item) => ({
      movieId: String(item.RepresentationMovieCode),
      movieName: item.MovieNameKR as string,
      rating: item.ViewGradeNameKR || undefined,
      durationMinutes: item.PlayTime === null || item.PlayTime === undefined ? undefined : toNumber(item.PlayTime),
      releaseDate: item.ReleaseDate || undefined,
    }));

  return { theaters, movies };
}

async function fetchPlaySequenceByPair(
  playDate: string,
  theater: LotteCinemaTheater,
  movie: LotteCinemaMovie,
  timeout = 15000,
): Promise<LotteCinemaShowtime[]> {
  const response = await requestLotteCinema<LotteCinemaPlaySequenceResponse>(
    LOTTECINEMA_API.METHODS.GET_PLAY_SEQUENCE,
    {
      playDate: normalizeDateForRequest(playDate),
      cinemaID: buildCompositeCinemaId(theater),
      representationMovieCode: movie.movieId,
    },
    timeout,
  );

  return (response.PlaySeqs?.Items || [])
    .filter((item) => item.CinemaID && item.RepresentationMovieCode && item.ScreenID && item.PlaySequence)
    .map((item) => {
      const totalSeats = toNumber(item.TotalSeatCount);
      const bookedSeats = toNumber(item.BookingSeatCount);
      const normalizedPlayDate = normalizeDateForOutput(item.PlayDt || playDate);
      const theaterId = String(item.CinemaID);
      const screenId = String(item.ScreenID);
      const playSequence = String(item.PlaySequence);

      return {
        scheduleId: buildScheduleId(normalizedPlayDate, theaterId, screenId, playSequence),
        theaterId,
        theaterName: item.CinemaNameKR || theater.theaterName,
        movieId: String(item.RepresentationMovieCode),
        movieName: item.MovieNameKR || movie.movieName,
        screenId,
        screenName: item.ScreenNameKR || '',
        playDate: normalizedPlayDate,
        startTime: formatTime(item.StartTime),
        endTime: formatTime(item.EndTime),
        totalSeats,
        bookedSeats,
        remainingSeats: Math.max(totalSeats - bookedSeats, 0),
      };
    });
}

export async function fetchLotteCinemaNowShowing(
  params: CommonFetchParams,
): Promise<{ theaters: LotteCinemaTheater[]; movies: LotteCinemaMovie[]; showtimes: LotteCinemaShowtime[] }> {
  const playDate = params.playDate || toYyyymmdd();
  const timeout = params.timeout || 15000;
  const ticketingPage = await fetchLotteCinemaTicketingPage(timeout);

  if (!params.theaterId && !params.movieId) {
    return {
      theaters: ticketingPage.theaters,
      movies: ticketingPage.movies,
      showtimes: [],
    };
  }

  const theaters = params.theaterId
    ? ticketingPage.theaters.filter((theater) => theater.theaterId === params.theaterId)
    : ticketingPage.theaters;
  const movies = params.movieId
    ? ticketingPage.movies.filter((movie) => movie.movieId === params.movieId)
    : ticketingPage.movies;

  if (theaters.length === 0 || movies.length === 0) {
    return { theaters, movies, showtimes: [] };
  }

  const targets = theaters.flatMap((theater) => movies.map((movie) => ({ theater, movie })));
  const results = await Promise.all(
    targets.map(({ theater, movie }) => fetchPlaySequenceByPair(playDate, theater, movie, timeout)),
  );

  const uniqueShowtimes = Array.from(
    new Map(results.flat().map((item) => [item.scheduleId, item])).values(),
  );
  const theaterIds = new Set(uniqueShowtimes.map((item) => item.theaterId));
  const movieIds = new Set(uniqueShowtimes.map((item) => item.movieId));

  return {
    theaters: ticketingPage.theaters.filter((theater) =>
      params.theaterId ? theater.theaterId === params.theaterId : theaterIds.has(theater.theaterId),
    ),
    movies: ticketingPage.movies.filter((movie) =>
      params.movieId ? movie.movieId === params.movieId : movieIds.has(movie.movieId),
    ),
    showtimes: uniqueShowtimes,
  };
}

export { toYyyymmdd };
