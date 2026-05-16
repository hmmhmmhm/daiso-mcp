/**
 * 롯데마트 매장 주소 지오코딩
 */

import { fetchJson } from '../../utils/http.js';
import { DEFAULT_LOTTEMART_TIMEOUT_MS } from './config.js';
import type { RequestOptions } from './clientTypes.js';

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const geocodeCache = new Map<string, { expiresAt: number; value: { latitude: number; longitude: number } | null }>();

export async function geocodeLotteMartAddress(address: string, options: RequestOptions = {}) {
  const keyword = address.trim();
  if (keyword.length === 0) {
    return null;
  }

  const cached = geocodeCache.get(keyword);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const apiKey = (options.googleMapsApiKey || '').trim();
  if (apiKey.length === 0) {
    return null;
  }

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('address', keyword);
  endpoint.searchParams.set('key', apiKey);

  const body = await fetchJson<GoogleGeocodeResponse>(endpoint.toString(), {
    method: 'GET',
    timeout: options.timeout || DEFAULT_LOTTEMART_TIMEOUT_MS,
    headers: {
      Accept: 'application/json',
    },
  });

  if (body.status !== 'OK') {
    geocodeCache.set(keyword, {
      expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
      value: null,
    });
    return null;
  }

  const latitude = body.results?.[0]?.geometry?.location?.lat;
  const longitude = body.results?.[0]?.geometry?.location?.lng;
  const value =
    typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : null;

  geocodeCache.set(keyword, {
    expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
    value,
  });

  return value;
}

export function __testOnlyClearLotteMartGeocodeCache(): void {
  geocodeCache.clear();
}
