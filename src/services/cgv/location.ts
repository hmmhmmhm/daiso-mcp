import type { CgvTransportOptions } from './relayTransport.js';
/**
 * CGV 위치 해석 및 근처 극장 조회 보조 모듈
 */

import {
  geocodeLocation,
  readGeocodeEnvironment,
  searchKakaoPlaces,
  validKoreanCoordinates,
} from '../../utils/geocode.js';
import { fetchCgvTheaters } from './client.js';
import type { CgvTheater } from './types.js';

interface RequestOptions extends CgvTransportOptions {
  timeout?: number;
  googleMapsApiKey?: string;
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  zyteApiKey?: string;
}

interface ResolveCgvLocationParams {
  keyword?: string;
  latitude?: number;
  longitude?: number;
  regionCode?: string;
  playDate?: string;
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
const BRAND_PATTERN = /\b(?:cgv|씨지브이)\b/giu;
const TRAILING_INTENT_PATTERN =
  /\s+(?:극장|영화관|영화|상영작|시간표|좌석|잔여좌석|남은좌석|목록|찾고|찾아|찾아서|알려|보여|추천|조회|확인|해주세요|해줘).*/u;

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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function sanitizeLocationKeyword(keyword: string): string {
  const trimmed = normalizeWhitespace(keyword);
  if (trimmed.length === 0) {
    return '';
  }

  let sanitized = normalizeWhitespace(trimmed.replace(BRAND_PATTERN, ' '));
  const nearbyMatch = sanitized.match(/^(.+?)\s*(?:근처|주변)\s*(?:극장|영화관)?(?:\s.*)?$/u);

  if (nearbyMatch?.[1]) {
    sanitized = normalizeWhitespace(nearbyMatch[1]);
  } else {
    sanitized = normalizeWhitespace(sanitized.replace(TRAILING_INTENT_PATTERN, ''));
  }

  return sanitized || trimmed;
}

export async function resolveCgvLocation(
  params: ResolveCgvLocationParams,
  options: RequestOptions = {},
): Promise<CgvResolvedLocation> {
  const keyword = sanitizeLocationKeyword((params.keyword || '').trim());
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

  const geocoded = await geocodeLocation(keyword, options);

  return {
    keyword,
    latitude: geocoded?.latitude ?? null,
    longitude: geocoded?.longitude ?? null,
    geocodeUsed: Boolean(geocoded),
    formattedAddress: geocoded?.formattedAddress ?? null,
  };
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
    ...options,
    zyteApiKey: options.zyteApiKey,
  });
  const location = await resolveCgvLocation(params, options);
  if (location.keyword && location.latitude === null)
    throw new Error(`위치를 좌표로 변환하지 못했습니다: ${location.keyword}`);
  const geocodeOptions = { ...readGeocodeEnvironment(), ...options };
  let resolvedCandidates: CgvResolvedTheater[];
  if (location.latitude !== null && location.longitude !== null) {
    // 주변 장소를 공식 CGV 목록에 연결하여 전국 앞부분만 검색하는 오류를 막습니다.
    const places = await searchKakaoPlaces('CGV', geocodeOptions, {
      latitude: location.latitude,
      longitude: location.longitude,
    });
    resolvedCandidates = places.flatMap((place) => {
      const cleanName = normalizeText((place.place_name || '').replace(/^CGV\s*/iu, ''));
      const theater = theaters.find(
        (item) => normalizeText(item.theaterName.replace(/^CGV\s*/iu, '')) === cleanName,
      );
      const latitude = Number(place.y);
      const longitude = Number(place.x);
      if (!theater || !validKoreanCoordinates(latitude, longitude)) return [];
      return [
        {
          ...theater,
          latitude,
          longitude,
          address: place.road_address_name || place.address_name || null,
          distanceKm: Number(
            calculateDistanceKm(
              location.latitude as number,
              location.longitude as number,
              latitude,
              longitude,
            ).toFixed(2),
          ),
        },
      ];
    });
  } else {
    resolvedCandidates = [];
  }

  const sorted = resolvedCandidates.sort((left, right) => {
    const leftDistance = left.distanceKm as number;
    const rightDistance = right.distanceKm as number;
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
  // 캐시를 유지하지 않으므로 초기화할 상태가 없습니다.
}
