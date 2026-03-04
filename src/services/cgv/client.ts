/**
 * CGV API 클라이언트
 */

import { formatTime, toNumber, toYyyymmdd } from '../../utils/format.js';
import { CGV_API } from './api.js';
import { requestCgv } from './transport.js';
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
  zyteApiKey?: string;
}

async function resolveTheaterCode(playDate: string, theaterCode: string | undefined, params: CommonFetchParams) {
  if (theaterCode) {
    return theaterCode;
  }

  const theaters = await fetchCgvTheaters({
    playDate,
    regionCode: params.regionCode,
    timeout: params.timeout,
    zyteApiKey: params.zyteApiKey,
  });

  return theaters[0]?.theaterCode || '0056';
}

async function fetchTimetableByMovieCode(
  playDate: string,
  theaterCode: string,
  movieCode: string,
  params: CommonFetchParams,
): Promise<CgvTimetable[]> {
  const searchParams = new URLSearchParams({
    coCd: CGV_API.COMPANY_CODE,
    siteNo: theaterCode,
    scnYmd: playDate,
    movNo: movieCode,
    rtctlScopCd: CGV_API.TIMETABLE_SCOPE_CODE,
  });

  const response = await requestCgv<CgvTimetableResponse>(
    CGV_API.TIMETABLE_PATH,
    searchParams,
    params.timeout,
    params.zyteApiKey,
  );

  return (response.data || [])
    .filter((item) => item.siteNo && item.movNo && item.scnYmd)
    .map((item) => ({
      scheduleId: `${item.scnYmd || playDate}${item.siteNo || ''}${item.scnSseq || ''}`,
      movieCode: item.movNo as string,
      movieName: item.movNm || '',
      theaterCode: item.siteNo as string,
      theaterName: item.siteNm || '',
      playDate: item.scnYmd || playDate,
      startTime: formatTime(item.scnsrtTm),
      endTime: formatTime(item.scnendTm),
      totalSeats: toNumber(item.stcnt),
      remainingSeats: toNumber(item.frSeatCnt || item.frtmpSeatCnt),
    }));
}

export async function fetchCgvTheaters(params: CommonFetchParams): Promise<CgvTheater[]> {
  const searchParams = new URLSearchParams({
    coCd: CGV_API.COMPANY_CODE,
  });

  const response = await requestCgv<CgvTheaterListResponse>(
    CGV_API.THEATER_LIST_PATH,
    searchParams,
    params.timeout,
    params.zyteApiKey,
  );

  const list = (response.data || []).flatMap((region) =>
    (region.siteList || []).map((site) => ({
      theaterCode: site.siteNo || '',
      theaterName: site.siteNm || '',
      regionCode: region.regnGrpCd || undefined,
      regionName: region.regnGrpNm || '',
    })),
  );

  return list
    .filter((item) => item.theaterCode && item.theaterName)
    .filter((item) => (params.regionCode ? item.regionCode === params.regionCode : true))
    .map(({ theaterCode, theaterName, regionCode }) => ({ theaterCode, theaterName, regionCode }));
}

export async function fetchCgvMovies(params: CommonFetchParams): Promise<CgvMovie[]> {
  const playDate = params.playDate || toYyyymmdd();
  const theaterCode = await resolveTheaterCode(playDate, params.theaterCode, params);

  const searchParams = new URLSearchParams({
    coCd: CGV_API.COMPANY_CODE,
    siteNo: theaterCode,
    scnYmd: playDate,
  });

  const response = await requestCgv<CgvMovieListResponse>(
    CGV_API.MOVIE_LIST_PATH,
    searchParams,
    params.timeout,
    params.zyteApiKey,
  );

  return (response.data || [])
    .filter((item) => item.movNo && item.movNm)
    .map((item) => ({
      movieCode: item.movNo as string,
      movieName: item.movNm as string,
      rating: item.cratgClsNm || undefined,
    }));
}

export async function fetchCgvTimetable(params: CommonFetchParams): Promise<CgvTimetable[]> {
  const playDate = params.playDate || toYyyymmdd();
  const theaterCode = await resolveTheaterCode(playDate, params.theaterCode, params);

  if (params.movieCode) {
    return fetchTimetableByMovieCode(playDate, theaterCode, params.movieCode, params);
  }

  const movies = await fetchCgvMovies({
    playDate,
    theaterCode,
    timeout: params.timeout,
    zyteApiKey: params.zyteApiKey,
  });

  for (const movie of movies) {
    const timetable = await fetchTimetableByMovieCode(playDate, theaterCode, movie.movieCode, params);
    if (timetable.length > 0) {
      return timetable;
    }
  }

  return [];
}

export { toYyyymmdd };
