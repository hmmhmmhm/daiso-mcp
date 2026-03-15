/**
 * 롯데시네마 위치 해석 및 근처 극장 조회 보조 모듈
 */

import { fetchJson } from '../../utils/http.js';
import { fetchLotteCinemaTicketingPage } from './client.js';
import type { LotteCinemaTheater } from './types.js';

interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
}

interface ResolveLotteCinemaLocationParams {
  keyword?: string;
  latitude?: number;
  longitude?: number;
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

export interface LotteCinemaResolvedLocation {
  keyword: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeUsed: boolean;
  formattedAddress: string | null;
}

export interface LotteCinemaResolvedTheater extends LotteCinemaTheater {
  distanceKm: number | null;
}

export interface LotteCinemaNearbyTheaterResult extends LotteCinemaResolvedLocation {
  playDate: string;
  count: number;
  theaters: LotteCinemaResolvedTheater[];
}

const DEFAULT_TIMEOUT_MS = 15000;
const GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000;
const LOCATION_STOPWORDS = new Set([
  '롯데시네마',
  '영화',
  '극장',
  '주변',
  '근처',
  '오늘',
  '상영',
  '영화목록',
  '시간표',
  '좌석',
  '잔여',
  '찾아',
  '주세요',
]);

const geocodeCache = new Map<
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
      if (normalized.endsWith('역') && normalized.length > 2) {
        tokens.add(normalized.slice(0, -1));
      }
    }
  }

  return [...tokens];
}

function scoreTheater(theater: LotteCinemaTheater, tokens: string[]): number {
  const normalizedName = normalizeText(theater.theaterName);
  const normalizedAddress = normalizeText(theater.address || '');

  return tokens.reduce((score, token) => {
    if (normalizedName.includes(token)) {
      return score + 2;
    }
    if (normalizedAddress.includes(token)) {
      return score + 1;
    }
    return score;
  }, 0);
}

async function geocodeAddress(
  query: string,
  options: RequestOptions,
): Promise<{ latitude: number; longitude: number; formattedAddress: string | null } | null> {
  const apiKey = (options.googleMapsApiKey || '').trim();
  const trimmedQuery = query.trim();
  if (apiKey.length === 0 || trimmedQuery.length === 0) {
    return null;
  }

  const cacheKey = `keyword:${trimmedQuery}`;
  const cached = geocodeCache.get(cacheKey);
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

  geocodeCache.set(cacheKey, {
    expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
    value,
  });

  return value;
}

export async function resolveLotteCinemaLocation(
  params: ResolveLotteCinemaLocationParams,
  options: RequestOptions = {},
): Promise<LotteCinemaResolvedLocation> {
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

  const geocoded = await geocodeAddress(keyword, options);

  return {
    keyword,
    latitude: geocoded?.latitude ?? null,
    longitude: geocoded?.longitude ?? null,
    geocodeUsed: Boolean(geocoded),
    formattedAddress: geocoded?.formattedAddress ?? null,
  };
}

export async function fetchLotteCinemaNearbyTheaters(
  params: ResolveLotteCinemaLocationParams & { playDate: string; limit?: number; timeout?: number },
  options: RequestOptions = {},
): Promise<LotteCinemaNearbyTheaterResult> {
  const timeout = typeof params.timeout === 'number' ? params.timeout : DEFAULT_TIMEOUT_MS;
  const limit = typeof params.limit === 'number' ? Math.max(1, params.limit) : 10;
  const location = await resolveLotteCinemaLocation(params, options);
  const { theaters } = await fetchLotteCinemaTicketingPage(timeout);

  let nearby: LotteCinemaResolvedTheater[];

  if (location.latitude !== null && location.longitude !== null) {
    nearby = theaters
      .filter((theater) => theater.latitude !== null && theater.longitude !== null)
      .map((theater) => ({
        ...theater,
        distanceKm: Number(
          calculateDistanceKm(
            location.latitude as number,
            location.longitude as number,
            theater.latitude as number,
            theater.longitude as number,
          ).toFixed(2),
        ),
      }))
      .sort((left, right) => left.distanceKm - right.distanceKm || left.theaterName.localeCompare(right.theaterName))
      .slice(0, limit);
  } else {
    const tokens = extractLocationTokens(location.keyword, location.formattedAddress);
    nearby = theaters
      .map((theater) => ({
        theater,
        score: scoreTheater(theater, tokens),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.theater.theaterName.localeCompare(right.theater.theaterName))
      .slice(0, limit)
      .map((item) => ({
        ...item.theater,
        distanceKm: null,
      }));
  }

  return {
    ...location,
    playDate: params.playDate,
    count: nearby.length,
    theaters: nearby,
  };
}

export async function resolveLotteCinemaNearestTheater(
  params: ResolveLotteCinemaLocationParams & { playDate: string; timeout?: number },
  options: RequestOptions = {},
): Promise<{ location: LotteCinemaResolvedLocation; theater: LotteCinemaResolvedTheater | null }> {
  const nearby = await fetchLotteCinemaNearbyTheaters(
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

export function __testOnlyClearLotteCinemaLocationCaches(): void {
  geocodeCache.clear();
}
