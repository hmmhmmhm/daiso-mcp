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
  zyteApiKey?: string;
}

interface ZyteExtractResponse {
  statusCode?: number;
  httpResponseBody?: string;
  detail?: string;
  title?: string;
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
  const timeoutId = setTimeout(controller.abort.bind(controller), timeout);
  return { controller, timeoutId };
}

function resolveZyteApiKey(apiKey?: string): string {
  if (apiKey && apiKey.trim().length > 0) {
    return apiKey;
  }

  /* c8 ignore start */
  if (typeof process !== 'undefined' && process.env?.ZYTE_API_KEY) {
    return process.env.ZYTE_API_KEY;
  }
  /* c8 ignore end */

  throw new Error('ZYTE_API_KEY가 설정되지 않았습니다. .env 또는 Cloudflare Worker Secret을 확인해주세요.');
}

function encodeBasicAuth(apiKey: string): string {
  if (typeof btoa === 'function') {
    return btoa(`${apiKey}:`);
  }

  /* c8 ignore start */
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(`${apiKey}:`).toString('base64');
  }

  throw new Error('Basic 인증 인코딩을 지원하지 않는 런타임입니다.');
  /* c8 ignore end */
}

/* c8 ignore start */
function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }

  throw new Error('Base64 디코딩을 지원하지 않는 런타임입니다.');
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  /* c8 ignore next */
  throw new Error('Base64 인코딩을 지원하지 않는 런타임입니다.');
}
/* c8 ignore end */

async function createSignature(pathname: string, bodyText: string, timestamp: string): Promise<string> {
  const payload = `${timestamp}|${pathname}|${bodyText}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(CGV_API.SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64(new Uint8Array(signed));
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  const text = await response.text();

  try {
    return JSON.parse(text) as TResponse;
  } catch {
    throw new Error(text.slice(0, 120) || 'CGV API 응답 파싱 실패');
  }
}

async function requestByZyte<TResponse>(
  path: string,
  searchParams: URLSearchParams,
  timeout: number,
  apiKey: string,
): Promise<TResponse> {
  const url = `${CGV_API.BASE_URL}${path}?${searchParams.toString()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createSignature(path, '', timestamp);
  const auth = encodeBasicAuth(resolveZyteApiKey(apiKey));

  const { controller, timeoutId } = createController(timeout);

  try {
    const response = await fetch(CGV_API.ZYTE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        url,
        httpResponseBody: true,
        customHttpRequestHeaders: [
          { name: 'Accept', value: 'application/json' },
          { name: 'Accept-Language', value: 'ko-KR' },
          { name: 'X-TIMESTAMP', value: timestamp },
          { name: 'X-SIGNATURE', value: signature },
        ],
      }),
      signal: controller.signal,
    });

    const result = (await response.json()) as ZyteExtractResponse;

    if (!response.ok) {
      throw new Error(`Zyte API 호출 실패: ${response.status} ${result.detail || result.title || ''}`.trim());
    }

    if (!result.httpResponseBody) {
      throw new Error('Zyte HTTP 응답 본문이 비어 있습니다.');
    }

    return JSON.parse(decodeBase64(result.httpResponseBody)) as TResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestCgv<TResponse>(
  path: string,
  searchParams: URLSearchParams,
  timeout = 15000,
  zyteApiKey?: string,
): Promise<TResponse> {
  const url = `${CGV_API.BASE_URL}${path}?${searchParams.toString()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createSignature(path, '', timestamp);
  const { controller, timeoutId } = createController(timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'ko-KR',
        'X-TIMESTAMP': timestamp,
        'X-SIGNATURE': signature,
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return await parseJsonResponse<TResponse>(response);
    }

    if (response.status === 403 && zyteApiKey) {
      return await requestByZyte<TResponse>(path, searchParams, timeout, zyteApiKey);
    }

    throw new Error(`CGV API 호출 실패: ${response.status}`);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('CGV API 요청 시간 초과');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

export function toYyyymmdd(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}
