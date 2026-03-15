/**
 * CGV 위치 해석 및 근처 극장 조회 보조 모듈
 */

import { fetchJson } from '../../utils/http.js';
import { fetchCgvTheaters } from './client.js';
import type { CgvTheater } from './types.js';

interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
  zyteApiKey?: string;
}

interface ResolveCgvLocationParams {
  keyword?: string;
  latitude?: number;
  longitude?: number;
  regionCode?: string;
  playDate?: string;
}

interface GoogleGeocodeResponse {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

export interface CgvResolvedLocation {
  keyword: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeUsed: boolean;
  formattedAddress: string | null;
}

export interface CgvResolvedTheater extends CgvTheater {
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  address: string | null;
}

export interface CgvNearbyTheaterResult extends CgvResolvedLocation {
  playDate: string;
  regionCode: string | null;
  count: number;
  theaters: CgvResolvedTheater[];
}

const DEFAULT_TIMEOUT_MS = 15000;
const USER_GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000;
const THEATER_GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATE_THEATERS = 12;
const LOCATION_STOPWORDS = new Set([
  'cgv',
  '극장',
  '영화',
  '주변',
  '근처',
  '오늘',
  '상영',
  '시간표',
  '좌석',
  '잔여',
  '찾아',
  '주세요',
  '주세요요',
  '역',
]);

const userGeocodeCache = new Map<
  string,
  { expiresAt: number; value: { latitude: number; longitude: number; formattedAddress: string | null } | null }
>();
const theaterGeocodeCache = new Map<
  string,
  { expiresAt: number; value: { latitude: number; longitude: number; formattedAddress: string | null } | null }
>();

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

function isValidCoordinate(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function extractLocationTokens(...values: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();

  for (const value of values) {
    const matches = (value || '').match(/[0-9A-Za-z가-힣]+/g) || [];
    for (const match of matches) {
      const normalized = normalizeText(match);
      if (normalized.length < 2 || LOCATION_STOPWORDS.has(normalized)) {
        continue;
      }
      tokens.add(normalized);
    }
  }

  return [...tokens];
}

function scoreTheaterName(theaterName: string, tokens: string[]): number {
  const normalized = normalizeText(theaterName);
  return tokens.reduce((score, token) => (normalized.includes(token) ? score + 1 : score), 0);
}

async function geocodeAddress(
  query: string,
  options: RequestOptions,
  cacheKey: string,
  ttlMs: number,
  cache: Map<
    string,
    { expiresAt: number; value: { latitude: number; longitude: number; formattedAddress: string | null } | null }
  >,
): Promise<{ latitude: number; longitude: number; formattedAddress: string | null } | null> {
  const apiKey = (options.googleMapsApiKey || '').trim();
  const trimmedQuery = query.trim();
  if (apiKey.length === 0 || trimmedQuery.length === 0) {
    return null;
  }

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('address', trimmedQuery);
  endpoint.searchParams.set('key', apiKey);

  const body = await fetchJson<GoogleGeocodeResponse>(endpoint.toString(), {
    method: 'GET',
    timeout: options.timeout || DEFAULT_TIMEOUT_MS,
    headers: { Accept: 'application/json' },
  });

  const firstResult = body.status === 'OK' ? body.results?.[0] : null;
  const latitude = firstResult?.geometry?.location?.lat;
  const longitude = firstResult?.geometry?.location?.lng;
  const value =
    typeof latitude === 'number' && typeof longitude === 'number'
      ? {
          latitude,
          longitude,
          formattedAddress: firstResult?.formatted_address || null,
        }
      : null;

  cache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    value,
  });

  return value;
}

export async function resolveCgvLocation(
  params: ResolveCgvLocationParams,
  options: RequestOptions = {},
): Promise<CgvResolvedLocation> {
  const keyword = (params.keyword || '').trim();
  const hasCoordinates = isValidCoordinate(params.latitude) && isValidCoordinate(params.longitude);

  if (hasCoordinates) {
    return {
      keyword: keyword.length > 0 ? keyword : null,
      latitude: params.latitude as number,
      longitude: params.longitude as number,
      geocodeUsed: false,
      formattedAddress: null,
    };
  }

  if (keyword.length === 0) {
    return {
      keyword: null,
      latitude: null,
      longitude: null,
      geocodeUsed: false,
      formattedAddress: null,
    };
  }

  const geocoded = await geocodeAddress(
    keyword,
    options,
    `user:${keyword}`,
    USER_GEOCODE_CACHE_TTL_MS,
    userGeocodeCache,
  );

  return {
    keyword,
    latitude: geocoded?.latitude ?? null,
    longitude: geocoded?.longitude ?? null,
    geocodeUsed: Boolean(geocoded),
    formattedAddress: geocoded?.formattedAddress ?? null,
  };
}

async function geocodeCgvTheater(
  theater: CgvTheater,
  options: RequestOptions,
): Promise<{ latitude: number; longitude: number; address: string | null } | null> {
  const cleanName = theater.theaterName.replace(/^CGV\s*/i, '').trim();
  const geocoded = await geocodeAddress(
    `대한민국 CGV ${cleanName}`,
    options,
    `theater:${theater.theaterCode}:${cleanName}`,
    THEATER_GEOCODE_CACHE_TTL_MS,
    theaterGeocodeCache,
  );

  return geocoded
    ? {
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        address: geocoded.formattedAddress,
      }
    : null;
}

function pickCandidateTheaters(theaters: CgvTheater[], tokens: string[]): CgvTheater[] {
  if (tokens.length === 0) {
    return theaters.slice(0, MAX_CANDIDATE_THEATERS);
  }

  const scored = theaters
    .map((theater) => ({ theater, score: scoreTheaterName(theater.theaterName, tokens) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.theater.theaterName.localeCompare(right.theater.theaterName))
    .map((item) => item.theater);

  return scored.slice(0, MAX_CANDIDATE_THEATERS);
}

export async function fetchCgvNearbyTheaters(
  params: ResolveCgvLocationParams & { playDate: string; limit?: number; timeout?: number },
  options: RequestOptions = {},
): Promise<CgvNearbyTheaterResult> {
  const limit = Math.max(1, params.limit || 10);
  const timeout = params.timeout || DEFAULT_TIMEOUT_MS;
  const theaters = await fetchCgvTheaters({
    playDate: params.playDate,
    regionCode: params.regionCode,
    timeout,
    zyteApiKey: options.zyteApiKey,
  });
  const location = await resolveCgvLocation(params, options);
  const tokens = extractLocationTokens(location.keyword, location.formattedAddress);
  const hasGoogleKey = (options.googleMapsApiKey || '').trim().length > 0;

  if (tokens.length === 0 && !hasGoogleKey) {
    return {
      ...location,
      playDate: params.playDate,
      regionCode: params.regionCode || null,
      count: 0,
      theaters: [],
    };
  }

  const candidates = pickCandidateTheaters(theaters, tokens);

  const resolvedCandidates = await Promise.all(
    candidates.map(async (theater) => {
      const geocoded = await geocodeCgvTheater(theater, options);
      const distanceKm =
        geocoded && location.latitude !== null && location.longitude !== null
          ? Number(calculateDistanceKm(location.latitude, location.longitude, geocoded.latitude, geocoded.longitude).toFixed(2))
          : null;

      return {
        ...theater,
        latitude: geocoded?.latitude ?? null,
        longitude: geocoded?.longitude ?? null,
        distanceKm,
        address: geocoded?.address ?? null,
      };
    }),
  );

  const sorted = resolvedCandidates.sort((left, right) => {
    const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance || left.theaterName.localeCompare(right.theaterName);
  });

  return {
    ...location,
    playDate: params.playDate,
    regionCode: params.regionCode || null,
    count: sorted.slice(0, limit).length,
    theaters: sorted.slice(0, limit),
  };
}

export async function resolveCgvNearestTheater(
  params: ResolveCgvLocationParams & { playDate: string; timeout?: number },
  options: RequestOptions = {},
): Promise<{ location: CgvResolvedLocation; theater: CgvResolvedTheater | null }> {
  const nearby = await fetchCgvNearbyTheaters(
    {
      ...params,
      limit: 1,
      timeout: params.timeout,
    },
    options,
  );

  return {
    location: {
      keyword: nearby.keyword,
      latitude: nearby.latitude,
      longitude: nearby.longitude,
      geocodeUsed: nearby.geocodeUsed,
      formattedAddress: nearby.formattedAddress,
    },
    theater: nearby.theaters[0] || null,
  };
}

export function __testOnlyClearCgvLocationCaches(): void {
  userGeocodeCache.clear();
  theaterGeocodeCache.clear();
}
