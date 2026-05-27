import type {
  OpinetAroundStationsResult,
  OpinetAveragePrice,
  OpinetAveragePricesResult,
  OpinetFuelCode,
  OpinetLowestStationsResult,
  OpinetSort,
  OpinetStationDetail,
  OpinetStationDetailResult,
  OpinetStationSummary,
} from './types.js';
import { resolveOpinetLocation } from './location.js';

const OPINET_API_BASE_URL = 'https://www.opinet.co.kr/api';
const OPINET_SOURCE = '한국석유공사 오피넷';
const DEFAULT_TIMEOUT_MS = 10000;

const FUEL_CODES = new Set(['B027', 'D047', 'B034', 'C004', 'K015']);

const BRAND_NAMES: Record<string, string> = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: '현대오일뱅크',
  SOL: 'S-OIL',
  RTE: '자영알뜰',
  RTX: '고속도로알뜰',
  NHO: '농협알뜰',
  ETC: '자가상표',
  E1G: 'E1',
  SKG: 'SK가스',
};

interface OpinetClientOptions {
  apiKey?: string;
  googleMapsApiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface OpinetEnvelope {
  RESULT?: {
    OIL?: unknown;
  };
  OIL?: unknown;
}

function getProcessEnvValue(name: string): string | undefined {
  /* c8 ignore next -- Worker 런타임은 bindings로 키를 주입합니다. */
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

function requireApiKey(apiKey: string | undefined): string {
  const resolved = apiKey?.trim() || getProcessEnvValue('OPINET_API_KEY')?.trim();
  if (!resolved) {
    throw new Error('OPINET_API_KEY 환경 변수가 필요합니다.');
  }
  return resolved;
}

export function normalizeFuelCode(value: string | undefined, fallback: OpinetFuelCode = 'B027'): OpinetFuelCode {
  const normalized = (value || fallback).trim().toUpperCase();
  if (!FUEL_CODES.has(normalized)) {
    throw new Error('fuelCode는 B027, D047, B034, C004, K015 중 하나여야 합니다.');
  }
  return normalized as OpinetFuelCode;
}

export function normalizeOpinetSort(value: string | undefined): OpinetSort {
  return value === 'distance' || value === '2' ? 'distance' : 'price';
}

function toOpinetSortCode(sort: OpinetSort): '1' | '2' {
  return sort === 'distance' ? '2' : '1';
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function toBooleanYn(value: unknown): boolean | undefined {
  const normalized = toStringValue(value).toUpperCase();
  if (normalized === 'Y') {
    return true;
  }
  if (normalized === 'N') {
    return false;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(asRecord);
  }
  if (value && typeof value === 'object') {
    return [asRecord(value)];
  }
  return [];
}

function unwrapOil(payload: OpinetEnvelope): Record<string, unknown>[] {
  return asArray(payload.RESULT?.OIL ?? payload.OIL);
}

async function fetchOpinetJson(path: string, params: Record<string, string>, options: OpinetClientOptions) {
  const url = new URL(`${OPINET_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('out', 'json');
  url.searchParams.set('certkey', requireApiKey(options.apiKey));

  const response = await (options.fetchImpl ?? fetch)(url.toString(), {
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const bodyText = await response.text();

  let parsed: OpinetEnvelope;
  try {
    parsed = JSON.parse(bodyText) as OpinetEnvelope;
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    throw new Error(`오피넷 API 호출 실패: HTTP ${response.status} ${bodyText}`);
  }

  return parsed;
}

function normalizeStationSummary(row: Record<string, unknown>): OpinetStationSummary {
  const brandCode = toStringValue(row.POLL_DIV_CD || row.POLL_DIV_CO);
  return {
    stationId: toStringValue(row.UNI_ID),
    brandCode,
    brandName: BRAND_NAMES[brandCode] || brandCode,
    name: toStringValue(row.OS_NM),
    price: toNumber(row.PRICE),
    distanceMeters: toNumber(row.DISTANCE),
    address: toStringValue(row.VAN_ADR) || undefined,
    roadAddress: toStringValue(row.NEW_ADR) || undefined,
    katecX: toNumber(row.GIS_X_COOR),
    katecY: toNumber(row.GIS_Y_COOR),
    raw: row,
  };
}

function normalizeAveragePrice(row: Record<string, unknown>): OpinetAveragePrice {
  return {
    tradeDate: toStringValue(row.TRADE_DT),
    productCode: toStringValue(row.PRODCD),
    productName: toStringValue(row.PRODNM),
    price: toNumber(row.PRICE),
    diff: toStringValue(row.DIFF),
    raw: row,
  };
}

function normalizeStationDetail(row: Record<string, unknown>): OpinetStationDetail {
  const summary = normalizeStationSummary(row);
  const prices = asArray(row.OIL_PRICE).map((priceRow) => ({
    productCode: toStringValue(priceRow.PRODCD),
    price: toNumber(priceRow.PRICE),
    tradeDate: toStringValue(priceRow.TRADE_DT),
    tradeTime: toStringValue(priceRow.TRADE_TM),
    raw: priceRow,
  }));

  return {
    ...summary,
    phone: toStringValue(row.TEL) || undefined,
    areaCode: toStringValue(row.SIGUNCD) || undefined,
    lpgType: toStringValue(row.LPG_YN) || undefined,
    hasMaintenance: toBooleanYn(row.MAINT_YN),
    hasCarWash: toBooleanYn(row.CAR_WASH_YN),
    hasConvenienceStore: toBooleanYn(row.CVS_YN),
    isKpetroCertified: toBooleanYn(row.KPETRO_YN),
    prices,
  };
}

export async function fetchOpinetAveragePrices(
  options: OpinetClientOptions = {},
): Promise<OpinetAveragePricesResult> {
  const payload = await fetchOpinetJson('avgAllPrice.do', {}, options);
  const prices = unwrapOil(payload).map(normalizeAveragePrice);
  return {
    provider: 'opinet',
    source: OPINET_SOURCE,
    fetchedAt: new Date().toISOString(),
    count: prices.length,
    prices,
  };
}

export async function fetchOpinetLowestStations(
  params: {
    fuelCode?: string;
    areaCode?: string;
    count?: number;
  },
  options: OpinetClientOptions = {},
): Promise<OpinetLowestStationsResult> {
  const fuelCode = normalizeFuelCode(params.fuelCode);
  const count = Math.min(Math.max(Math.trunc(params.count ?? 10), 1), 20);
  const apiParams: Record<string, string> = {
    prodcd: fuelCode,
    cnt: String(count),
  };
  const areaCode = params.areaCode?.trim();
  if (areaCode) {
    apiParams.area = areaCode;
  }

  const payload = await fetchOpinetJson('lowTop10.do', apiParams, options);
  const stations = unwrapOil(payload).map(normalizeStationSummary);
  return {
    provider: 'opinet',
    source: OPINET_SOURCE,
    fetchedAt: new Date().toISOString(),
    fuelCode,
    areaCode: areaCode || null,
    count: stations.length,
    stations,
  };
}

export async function fetchOpinetStationsAround(
  params: {
    x?: number;
    y?: number;
    latitude?: number;
    longitude?: number;
    location?: string;
    radiusMeters?: number;
    fuelCode?: string;
    sort?: string;
  },
  options: OpinetClientOptions = {},
): Promise<OpinetAroundStationsResult> {
  const resolvedLocation = await resolveOpinetLocation(params, {
    googleMapsApiKey: options.googleMapsApiKey,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const radiusMeters = Math.min(Math.max(Math.trunc(params.radiusMeters ?? 3000), 100), 5000);
  const fuelCode = normalizeFuelCode(params.fuelCode);
  const sort = normalizeOpinetSort(params.sort);
  const payload = await fetchOpinetJson(
    'aroundAll.do',
    {
      x: String(resolvedLocation.katec.x),
      y: String(resolvedLocation.katec.y),
      radius: String(radiusMeters),
      prodcd: fuelCode,
      sort: toOpinetSortCode(sort),
    },
    options,
  );
  const stations = unwrapOil(payload).map(normalizeStationSummary);
  return {
    provider: 'opinet',
    source: OPINET_SOURCE,
    fetchedAt: new Date().toISOString(),
    fuelCode,
    radiusMeters,
    sort,
    katec: resolvedLocation.katec,
    location: {
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude,
      location: resolvedLocation.location,
      formattedAddress: resolvedLocation.formattedAddress,
      geocodeUsed: resolvedLocation.geocodeUsed,
      inputType: resolvedLocation.inputType,
    },
    count: stations.length,
    stations,
  };
}

export async function fetchOpinetStationDetail(
  stationId: string,
  options: OpinetClientOptions = {},
): Promise<OpinetStationDetailResult> {
  const id = stationId.trim();
  if (!id) {
    throw new Error('주유소 ID를 입력해주세요.');
  }

  const payload = await fetchOpinetJson('detailById.do', { id }, options);
  const station = unwrapOil(payload).map(normalizeStationDetail)[0] ?? null;
  return {
    provider: 'opinet',
    source: OPINET_SOURCE,
    fetchedAt: new Date().toISOString(),
    station,
  };
}
