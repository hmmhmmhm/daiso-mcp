/**
 * 메가박스 위치 해석 및 근처 지점 조회 보조 모듈
 */

import { geocodeLocation, validKoreanCoordinates } from '../../utils/geocode.js';
import { fetchMegaboxBookingList, fetchMegaboxTheaterInfo } from './client.js';

interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
}

interface ResolveMegaboxLocationParams {
  keyword?: string;
  latitude?: number;
  longitude?: number;
  areaCode?: string;
}

export interface MegaboxNearbyTheater {
  theaterId: string;
  theaterName: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface MegaboxResolvedLocation {
  keyword: string | null;
  latitude: number;
  longitude: number;
  areaCode: string;
  geocodeUsed: boolean;
}

export interface MegaboxNearbyTheaterResult extends MegaboxResolvedLocation {
  playDate: string;
  count: number;
  theaters: MegaboxNearbyTheater[];
}

const DEFAULT_LATITUDE = 37.5665;
const DEFAULT_LONGITUDE = 126.978;
const DEFAULT_AREA_CODE = '11';
const DEFAULT_TIMEOUT_MS = 15000;

const MEGABOX_AREA_CODE_BY_REGION: Array<[string, string]> = [
  ['서울특별시', '11'],
  ['서울', '11'],
  ['부산광역시', '26'],
  ['부산', '26'],
  ['대구광역시', '27'],
  ['대구', '27'],
  ['인천광역시', '28'],
  ['인천', '28'],
  ['광주광역시', '29'],
  ['광주', '29'],
  ['대전광역시', '30'],
  ['대전', '30'],
  ['울산광역시', '31'],
  ['울산', '31'],
  ['세종특별자치시', '36'],
  ['세종', '36'],
  ['경기도', '41'],
  ['경기', '41'],
  ['강원특별자치도', '42'],
  ['강원도', '42'],
  ['강원', '42'],
  ['충청북도', '43'],
  ['충북', '43'],
  ['충청남도', '44'],
  ['충남', '44'],
  ['전북특별자치도', '45'],
  ['전라북도', '45'],
  ['전북', '45'],
  ['전라남도', '46'],
  ['전남', '46'],
  ['경상북도', '47'],
  ['경북', '47'],
  ['경상남도', '48'],
  ['경남', '48'],
  ['제주특별자치도', '50'],
  ['제주도', '50'],
  ['제주', '50'],
];

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

function resolveAreaCodeFromText(text: string): string | null {
  const normalized = text.replace(/\s+/g, '');
  for (const [region, areaCode] of MEGABOX_AREA_CODE_BY_REGION) {
    if (normalized.includes(region.replace(/\s+/g, ''))) {
      return areaCode;
    }
  }
  return null;
}

export async function resolveMegaboxLocation(
  params: ResolveMegaboxLocationParams,
  options: RequestOptions = {},
): Promise<MegaboxResolvedLocation> {
  const explicitAreaCode = (params.areaCode || '').trim();
  const keyword = (params.keyword || '').trim();
  const hasCoordinates = isValidCoordinate(params.latitude) && isValidCoordinate(params.longitude);
  if (
    hasCoordinates &&
    !validKoreanCoordinates(params.latitude as number, params.longitude as number)
  )
    throw new Error('유효한 위도/경도를 입력해주세요.');

  const geocoded = !hasCoordinates && keyword ? await geocodeLocation(keyword, options) : null;
  if (keyword && !hasCoordinates && !geocoded)
    throw new Error(`위치를 좌표로 변환하지 못했습니다: ${keyword}`);
  const latitude = hasCoordinates
    ? (params.latitude as number)
    : (geocoded?.latitude ?? DEFAULT_LATITUDE);
  const longitude = hasCoordinates
    ? (params.longitude as number)
    : (geocoded?.longitude ?? DEFAULT_LONGITUDE);
  const areaCode =
    explicitAreaCode ||
    resolveAreaCodeFromText(geocoded?.formattedAddress || keyword) ||
    (hasCoordinates ? '' : DEFAULT_AREA_CODE);
  const geocodeUsed = Boolean(geocoded);

  return {
    keyword: keyword.length > 0 ? keyword : null,
    latitude,
    longitude,
    areaCode,
    geocodeUsed,
  };
}

export async function fetchMegaboxNearbyTheaters(
  params: ResolveMegaboxLocationParams & { playDate: string; limit?: number; timeout?: number },
  options: RequestOptions = {},
): Promise<MegaboxNearbyTheaterResult> {
  const timeout = params.timeout || DEFAULT_TIMEOUT_MS;
  const limit = Math.max(1, params.limit || 10);
  const resolved = await resolveMegaboxLocation(params, options);
  const { theaters } = await fetchMegaboxBookingList({
    playDate: params.playDate,
    areaCode: resolved.areaCode,
    timeout,
  });

  const infoResults = await Promise.allSettled(
    theaters.map((theater) => fetchMegaboxTheaterInfo(theater.theaterId, timeout)),
  );

  const merged = theaters
    .map((theater, index) => {
      const infoResult = infoResults[index];
      if (infoResult.status !== 'fulfilled') {
        return null;
      }

      const info = infoResult.value;
      if (info.latitude === null || info.longitude === null) {
        return null;
      }

      return {
        theaterId: theater.theaterId,
        theaterName: theater.theaterName,
        address: info.address,
        latitude: info.latitude,
        longitude: info.longitude,
        distanceKm: Number(
          calculateDistanceKm(
            resolved.latitude,
            resolved.longitude,
            info.latitude,
            info.longitude,
          ).toFixed(2),
        ),
      };
    })
    .filter((theater): theater is MegaboxNearbyTheater => theater !== null)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit);

  return {
    ...resolved,
    playDate: params.playDate,
    count: merged.length,
    theaters: merged,
  };
}

export async function resolveMegaboxNearestTheater(
  params: ResolveMegaboxLocationParams & { playDate: string; timeout?: number },
  options: RequestOptions = {},
): Promise<{
  theater: MegaboxNearbyTheater | null;
  location: MegaboxResolvedLocation;
}> {
  const location = await resolveMegaboxLocation(params, options);
  const nearby = await fetchMegaboxNearbyTheaters(
    {
      ...params,
      playDate: params.playDate,
      limit: 1,
      areaCode: location.areaCode,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    options,
  );

  return {
    theater: nearby.theaters[0] || null,
    location,
  };
}

export function __testOnlyClearMegaboxLocationCaches(): void {
  // 캐시를 유지하지 않으므로 초기화할 상태가 없습니다.
}
