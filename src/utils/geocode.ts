import { fetchJson } from './http.js';
import { searchNaverLocalPlaces } from '../services/places/client.js';

export interface GeocodeOptions {
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  googleMapsApiKey?: string;
  fetchImpl?: typeof fetch;
  timeout?: number;
  timeoutMs?: number;
}
export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
}
interface KakaoDocument {
  x?: string;
  y?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
}
function validKakaoDocument(value: unknown): value is KakaoDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Record<string, unknown>;
  return ['place_name', 'address_name', 'road_address_name'].every((field) => document[field] === undefined || typeof document[field] === 'string');
}
export function readGeocodeEnvironment(): GeocodeOptions {
  const env = typeof process === 'undefined' ? {} : process.env;
  return {
    kakaoRestApiKey: env.KAKAO_REST_API_KEY,
    naverClientId: env.NAVER_CLIENT_ID,
    naverClientSecret: env.NAVER_CLIENT_SECRET,
  };
}
export function geocodeBindings(bindings?: {
  KAKAO_REST_API_KEY?: string;
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
}): GeocodeOptions {
  return {
    kakaoRestApiKey: bindings?.KAKAO_REST_API_KEY,
    naverClientId: bindings?.NAVER_CLIENT_ID,
    naverClientSecret: bindings?.NAVER_CLIENT_SECRET,
  };
}
export function validKoreanCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 33 &&
    latitude <= 39 &&
    longitude >= 124 &&
    longitude <= 132
  );
}
const normalize = (value: string) =>
  value
    .replace(/특별자치시|특별자치도|특별시|광역시/gu, '')
    .replace(/경기도/gu, '경기')
    .replace(/충청북도/gu, '충북')
    .replace(/충청남도/gu, '충남')
    .replace(/전라북도|전북특별자치도/gu, '전북')
    .replace(/전라남도/gu, '전남')
    .replace(/경상북도/gu, '경북')
    .replace(/경상남도/gu, '경남')
    .replace(/강원도/gu, '강원')
    .replace(/제주도/gu, '제주')
    .replace(/[^0-9a-z가-힣]/giu, '')
    .toLowerCase();
function matches(query: string, value: string): boolean {
  const tokens =
    query
      .replace(/^대한민국\s*/u, '')
      .match(/[0-9]+(?:-[0-9]+)?|[a-z가-힣]+/giu)
      ?.map((token) => (/^\d/u.test(token) ? token : normalize(token))) || [];
  const normalized = normalize(value);
  return (
    tokens.length > 0 &&
    tokens.every((token) =>
      /^\d+(?:-\d+)?$/u.test(token)
        ? value.match(/\d+(?:-\d+)?/gu)?.includes(token)
        : token.endsWith('역')
          ? new RegExp(`${token}(?:[0-9]+호선|$|[^가-힣])`, 'u').test(value)
          : normalized.includes(token),
    )
  );
}
export async function searchKakaoPlaces(
  query: string,
  options: GeocodeOptions,
  coordinates?: { latitude: number; longitude: number },
): Promise<KakaoDocument[]> {
  const key = (options.kakaoRestApiKey ?? readGeocodeEnvironment().kakaoRestApiKey)?.trim();
  if (!key) return [];
  const endpoint = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('size', '15');
  if (coordinates) {
    endpoint.searchParams.set('x', String(coordinates.longitude));
    endpoint.searchParams.set('y', String(coordinates.latitude));
    endpoint.searchParams.set('radius', '20000');
    endpoint.searchParams.set('sort', 'distance');
  }
  const body = await fetchJson<{ documents?: KakaoDocument[] }>(endpoint.toString(), {
    fetchImpl: options.fetchImpl,
    headers: { Authorization: `KakaoAK ${key}` },
    timeout: options.timeout ?? options.timeoutMs ?? 10000,
  });
  return Array.isArray(body.documents)
    ? body.documents.filter(validKakaoDocument)
    : [];
}
export async function geocodeLocation(
  query: string,
  input: GeocodeOptions = {},
): Promise<GeocodedLocation | null> {
  const keyword = query.trim();
  if (!keyword) return null;
  const env = readGeocodeEnvironment();
  const options = {
    ...input,
    kakaoRestApiKey: input.kakaoRestApiKey ?? env.kakaoRestApiKey,
    naverClientId: input.naverClientId ?? env.naverClientId,
    naverClientSecret: input.naverClientSecret ?? env.naverClientSecret,
  };
  const isAddress = /(?:로|길|동|읍|면|리)\s*\d/u.test(keyword);
  let documents: KakaoDocument[] = [];
  if (options.kakaoRestApiKey?.trim()) {
    try {
      if (isAddress) {
        const endpoint = new URL('https://dapi.kakao.com/v2/local/search/address.json');
        endpoint.searchParams.set('query', keyword);
        const body = await fetchJson<{ documents?: KakaoDocument[] }>(endpoint.toString(), {
          fetchImpl: options.fetchImpl,
          headers: { Authorization: `KakaoAK ${options.kakaoRestApiKey.trim()}` },
          timeout: options.timeout ?? options.timeoutMs ?? 10000,
        });
        documents = Array.isArray(body.documents)
          ? body.documents.filter(validKakaoDocument)
          : [];
      } else documents = await searchKakaoPlaces(keyword, options);
    } catch {
      // 장소명은 네이버 지역 검색으로 보완하고 주소는 잘못된 장소로 대체하지 않습니다.
    }
  }
  for (const document of documents) {
    if (!isAddress && !document.place_name?.trim()) continue;
    const latitude = Number(document.y);
    const longitude = Number(document.x);
    if (
      !validKoreanCoordinates(latitude, longitude) ||
      !(isAddress
        ? matches(keyword, document.address_name || '') ||
          matches(keyword, document.road_address_name || '')
        : matches(
            keyword,
            `${document.place_name} ${document.address_name || ''} ${document.road_address_name || ''}`,
          ))
    )
      continue;
    return {
      latitude,
      longitude,
      formattedAddress: document.road_address_name || document.address_name || null,
    };
  }
  if (!isAddress && options.naverClientId && options.naverClientSecret) {
    try {
      const result = await searchNaverLocalPlaces({
        ...options,
        keyword,
        timeoutMs: options.timeout ?? options.timeoutMs,
      });
      const place = result.places.find(
        (item) =>
          item.latitude !== null &&
          item.longitude !== null &&
          validKoreanCoordinates(item.latitude, item.longitude) &&
          matches(keyword, `${item.name} ${item.address} ${item.roadAddress}`),
      );
      if (place)
        return {
          latitude: place.latitude as number,
          longitude: place.longitude as number,
          formattedAddress: place.roadAddress || place.address || null,
        };
    } catch {
      return null;
    }
  }
  return null;
}
