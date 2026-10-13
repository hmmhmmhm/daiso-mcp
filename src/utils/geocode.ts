import { fetchJson } from './http.js';
import { createGeocodeFetch } from './geocodeFetch.js';
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
  return ['place_name', 'address_name', 'road_address_name'].every(
    (field) => document[field] === undefined || typeof document[field] === 'string',
  );
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
function matchesAddress(query: string, address: string): boolean {
  // 지역과 도로명은 독립 토큰으로, 도로 번호와 건물 번호는 순서까지 검증합니다.
  const tokens = (value: string) =>
    value
      .replace(/^대한민국\s*/u, '')
      .match(/[0-9]+(?:-[0-9]+)?|[a-z가-힣]+/giu)
      ?.map(normalize) ?? [];
  const expected = tokens(query);
  const actual = tokens(address);
  return (
    query.match(/\d+(?:-\d+)?/gu)!.join(',') ===
      (address.match(/\d+(?:-\d+)?/gu)?.join(',') ?? '') &&
    expected.every((token) => actual.includes(token))
  );
}
function kakaoLocation(
  query: string,
  documents: KakaoDocument[],
  isAddress: boolean,
): GeocodedLocation | null {
  for (const document of documents) {
    if (!isAddress && !document.place_name?.trim()) continue;
    const latitude = Number(document.y);
    const longitude = Number(document.x);
    if (
      !validKoreanCoordinates(latitude, longitude) ||
      !(isAddress
        ? matchesAddress(query, document.address_name || '') ||
          matchesAddress(query, document.road_address_name || '')
        : matches(
            query,
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
  return null;
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
    fetchImpl: createGeocodeFetch(options.fetchImpl, options.timeout ?? options.timeoutMs ?? 10000),
    headers: { Authorization: `KakaoAK ${key}` },
    timeout: options.timeout ?? options.timeoutMs ?? 10000,
  });
  return Array.isArray(body.documents) ? body.documents.filter(validKakaoDocument) : [];
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
  // 대체 공급자도 최초 요청의 남은 시간만 사용합니다.
  const deadline = Date.now() + (options.timeout ?? options.timeoutMs ?? 10000);
  const remaining = () => deadline - Date.now();
  const isAddress = /(?:로|길|동|읍|면|리)\s*\d/u.test(keyword);
  let documents: KakaoDocument[] = [];
  const kakaoTimeout = remaining();
  if (options.kakaoRestApiKey?.trim() && kakaoTimeout > 0) {
    try {
      if (isAddress) {
        const endpoint = new URL('https://dapi.kakao.com/v2/local/search/address.json');
        endpoint.searchParams.set('query', keyword);
        const body = await fetchJson<{ documents?: KakaoDocument[] }>(endpoint.toString(), {
          fetchImpl: createGeocodeFetch(
            options.fetchImpl,
            kakaoTimeout,
          ),
          headers: { Authorization: `KakaoAK ${options.kakaoRestApiKey.trim()}` },
          timeout: kakaoTimeout,
        });
        documents = Array.isArray(body.documents) ? body.documents.filter(validKakaoDocument) : [];
      } else documents = await searchKakaoPlaces(keyword, { ...options, timeout: kakaoTimeout });
    } catch {
      // 오류나 빈 결과는 정확하게 일치하는 대체 검색으로 보완합니다.
    }
  }
  const location = kakaoLocation(keyword, documents, isAddress);
  if (location) return location;
  const keywordTimeout = remaining();
  if (isAddress && options.kakaoRestApiKey?.trim() && keywordTimeout > 0) {
    try {
      const fallback = kakaoLocation(
        keyword, await searchKakaoPlaces(keyword, { ...options, timeout: keywordTimeout }), true,
      );
      if (fallback) return fallback;
    } catch {
      // 주소가 정확하게 일치하는 네이버 결과가 있으면 보완합니다.
    }
  }
  const naverTimeout = remaining();
  if (options.naverClientId && options.naverClientSecret && naverTimeout > 0) {
    try {
      const result = await searchNaverLocalPlaces({
        ...options,
        keyword,
        fetchImpl: createGeocodeFetch(
          options.fetchImpl,
          naverTimeout,
        ),
        timeoutMs: naverTimeout,
      });
      const place = result.places.find(
        (item) =>
          item.latitude !== null &&
          item.longitude !== null &&
          validKoreanCoordinates(item.latitude, item.longitude) &&
          (isAddress
            ? matchesAddress(keyword, item.address) || matchesAddress(keyword, item.roadAddress)
            : matches(keyword, `${item.name} ${item.address} ${item.roadAddress}`)),
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
