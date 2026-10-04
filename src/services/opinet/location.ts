import {
  geocodeLocation as resolveFreeLocation,
  validKoreanCoordinates,
} from '../../utils/geocode.js';
import proj4 from 'proj4';

const WGS84 = 'EPSG:4326';
const KATEC = 'KATEC';
const KATEC_PROJ4 =
  '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';

proj4.defs(KATEC, KATEC_PROJ4);

export interface OpinetLocationInput {
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
  location?: string;
}

export interface OpinetLocationOptions {
  googleMapsApiKey?: string;
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ResolvedOpinetLocation {
  katec: {
    x: number;
    y: number;
  };
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  formattedAddress: string | null;
  geocodeUsed: boolean;
  inputType: 'katec' | 'coordinates' | 'location';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function wgs84ToKatec(latitude: number, longitude: number): { x: number; y: number } {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    throw new Error('유효한 위도/경도를 입력해주세요.');
  }

  const [x, y] = proj4(WGS84, KATEC, [longitude, latitude]);
  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
  };
}

async function geocodeLocation(
  location: string,
  options: OpinetLocationOptions,
): Promise<{ latitude: number; longitude: number; formattedAddress: string | null } | null> {
  return resolveFreeLocation(location, options);
}

export async function resolveOpinetLocation(
  input: OpinetLocationInput,
  options: OpinetLocationOptions = {},
): Promise<ResolvedOpinetLocation> {
  if (isFiniteNumber(input.x) && isFiniteNumber(input.y)) {
    return {
      katec: { x: input.x, y: input.y },
      latitude: null,
      longitude: null,
      location: input.location?.trim() || null,
      formattedAddress: null,
      geocodeUsed: false,
      inputType: 'katec',
    };
  }

  if (isFiniteNumber(input.latitude) && isFiniteNumber(input.longitude)) {
    if (!validKoreanCoordinates(input.latitude, input.longitude))
      throw new Error('유효한 위도/경도를 입력해주세요.');
    return {
      katec: wgs84ToKatec(input.latitude, input.longitude),
      latitude: input.latitude,
      longitude: input.longitude,
      location: input.location?.trim() || null,
      formattedAddress: null,
      geocodeUsed: false,
      inputType: 'coordinates',
    };
  }

  const location = input.location?.trim() || '';
  if (location.length > 0) {
    const geocoded = await geocodeLocation(location, options);
    if (!geocoded) {
      throw new Error(`위치를 좌표로 변환하지 못했습니다: ${location}`);
    }

    return {
      katec: wgs84ToKatec(geocoded.latitude, geocoded.longitude),
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      location,
      formattedAddress: geocoded.formattedAddress,
      geocodeUsed: true,
      inputType: 'location',
    };
  }

  throw new Error(
    'KATEC x/y, 위도/경도(latitude/longitude), 또는 location 중 하나를 입력해주세요.',
  );
}

export function __testOnlyClearOpinetGeocodeCache(): void {
  // 캐시를 유지하지 않으므로 초기화할 상태가 없습니다.
}
