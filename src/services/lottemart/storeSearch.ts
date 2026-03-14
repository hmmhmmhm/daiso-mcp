/**
 * 롯데마트 매장 검색 보조 로직
 */

import { LOTTEMART_AREAS, type LotteMartAreaCode } from './api.js';
import { calculateDistanceM, matchesBrandVariant, matchesKeyword } from './parser.js';
import type { LotteMartStore } from './types.js';

export function normalizeArea(area?: string): LotteMartAreaCode | undefined {
  const trimmed = (area || '').trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed === '제주') {
    return '기타';
  }

  return LOTTEMART_AREAS.find((value) => value === trimmed);
}

export function toDisplayArea(area: LotteMartAreaCode | string): string {
  return area === '기타' ? '제주' : area;
}

export function getTargetAreas(area?: string): string[] {
  return area ? [area] : [...LOTTEMART_AREAS];
}

export function attachDistance(
  stores: LotteMartStore[],
  latitude: number | undefined,
  longitude: number | undefined,
): LotteMartStore[] {
  return stores.map((store) => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return store;
    }

    if (store.latitude === 0 || store.longitude === 0) {
      return store;
    }

    return {
      ...store,
      distanceM: calculateDistanceM(latitude, longitude, store.latitude, store.longitude),
    };
  });
}

export async function fetchAllStoresForAreaList(
  areas: string[],
  fetcher: (area: string) => Promise<LotteMartStore[]>,
): Promise<LotteMartStore[]> {
  return (await Promise.all(areas.map((value) => fetcher(value)))).flat();
}

export async function fetchKeywordMatchedStores(
  areas: string[],
  keyword: string,
  brandVariant: string,
  limit: number,
  fetcher: (area: string) => Promise<LotteMartStore[]>,
): Promise<LotteMartStore[]> {
  const stores: LotteMartStore[] = [];

  for (const currentArea of areas) {
    const areaStores = await fetcher(currentArea);
    const matched = areaStores
      .filter((store) => matchesKeyword(store, keyword))
      .filter((store) => matchesBrandVariant(store, brandVariant));

    stores.push(...matched);
    if (stores.length >= limit) {
      break;
    }
  }

  return stores;
}
