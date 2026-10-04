/**
 * 롯데시네마 위치 해석 및 근처 극장 조회 보조 모듈
 */

import { geocodeLocation, validKoreanCoordinates } from '../../utils/geocode.js';
import { fetchLotteCinemaTicketingPage } from './client.js';
import type { LotteCinemaTheater } from './types.js';

interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
}

interface ResolveLotteCinemaLocationParams {
  keyword?: string;
  latitude?: number;
  longitude?: number;
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

async function geocodeAddress(
  query: string,
  options: RequestOptions,
): Promise<{ latitude: number; longitude: number; formattedAddress: string | null } | null> {
  const trimmedQuery = query.trim();
  const value = await geocodeLocation(trimmedQuery, options);

  return value;
}

export async function resolveLotteCinemaLocation(
  params: ResolveLotteCinemaLocationParams,
  options: RequestOptions = {},
): Promise<LotteCinemaResolvedLocation> {
  const keyword = (params.keyword || '').trim();
  const hasCoordinates = isValidCoordinate(params.latitude) && isValidCoordinate(params.longitude);
  if (
    hasCoordinates &&
    !validKoreanCoordinates(params.latitude as number, params.longitude as number)
  )
    throw new Error('유효한 위도/경도를 입력해주세요.');

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
  if (!geocoded) throw new Error(`위치를 좌표로 변환하지 못했습니다: ${keyword}`);

  return {
    keyword,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    geocodeUsed: true,
    formattedAddress: geocoded.formattedAddress,
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
      .sort(
        (left, right) =>
          left.distanceKm - right.distanceKm || left.theaterName.localeCompare(right.theaterName),
      )
      .slice(0, limit);
  } else {
    nearby = [];
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
  // 캐시를 유지하지 않으므로 초기화할 상태가 없습니다.
}
