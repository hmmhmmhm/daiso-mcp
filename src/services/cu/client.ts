import { hasConvenienceRelay, requestConvenienceRelay, type ConvenienceTransportOptions } from '../../utils/convenienceTransport.js';
import { geocodeLocation } from '../../utils/geocode.js';
/**
 * CU API 클라이언트
 */

import { fetchJson } from '../../utils/http.js';
import { fetchJsonWithZyteFallback } from '../../utils/zyteJsonFallback.js';
import { CU_API } from './api.js';
import { cuStockUnavailableReason } from './upstreamError.js';
import { parseInventoryQuantity } from '../inventoryQuantity.js';
import type { CuStockItem, CuStockMainResponse, CuStore, CuStoreResponse } from './types.js';

interface RequestOptions extends ConvenienceTransportOptions {
  timeout?: number;
  apiKey?: string;
  googleMapsApiKey?: string;
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
}

interface FetchCuStoresParams {
  latitude?: number;
  longitude?: number;
  searchWord?: string;
  itemCd?: string;
  onItemNo?: string;
  jipCd?: string;
  isRecommend?: string;
  recommendId?: string;
  pageType?: string;
}

interface FetchCuStockParams {
  keyword: string;
  limit: number;
  offset: number;
  searchSort: string;
}





export const CU_DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36;BGFCU',
} as const;

const CU_WEB_DEFAULT_HEADERS = {
  // Workers의 기본 요청에는 User-Agent가 없어 공식 웹이 400을 반환합니다.
  'User-Agent': 'Mozilla/5.0',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'text/html, */*; q=0.01',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: 'https://cu.bgfretail.com',
  Referer: 'https://cu.bgfretail.com/store/list.do?category=store',
} as const;


function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toYnBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized === 'Y' || normalized === 'TRUE';
  }

  return false;
}

function toStoreAddress(raw: {
  addrFst?: string | null;
  addrDetail?: string | null;
  doroStoreAddr1?: string | null;
  doroStoreAddr2?: string | null;
}): string {
  const road = [raw.doroStoreAddr1 || '', raw.doroStoreAddr2 || ''].join(' ').trim();
  if (road.length > 0) {
    return road;
  }

  return [raw.addrFst || '', raw.addrDetail || ''].join(' ').trim();
}

async function requestCuJson<T>(
  path: string,
  body: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<T> {
  if (hasConvenienceRelay(options)) {
    const operation = path === CU_API.STORE_PATH ? 'cu-store' : 'cu-stock';
    return requestConvenienceRelay<T>(operation, body, options, options.timeout);
  }
  return fetchJsonWithZyteFallback<T>(`${CU_API.BASE_URL}${path}`, {
    method: 'POST',
    timeout: options.timeout,
    headers: CU_DEFAULT_HEADERS,
    body: JSON.stringify(body),
    zyteApiKey: options.apiKey,
    zyteTags: { service: 'cu' },
  });
}

async function requestCuWebHtml(
  path: string,
  body: Record<string, string>,
  _apiKey?: string,
  timeout = 15000,
): Promise<string> {
  const form = new URLSearchParams(body);
  const formText = form.toString();
  const targetUrl = `${CU_API.WEB_BASE_URL}${path}`;
  // 공식 웹의 GET 조회는 같은 검색 조건을 지원하며 추가 재시도 시간을 쓰지 않습니다.
  const response = await fetch(`${targetUrl}?${formText}`, {
    method: 'GET',
    headers: CU_WEB_DEFAULT_HEADERS,
    signal: AbortSignal.timeout(timeout),
  });

  if (response.ok) {
    return response.text();
  }

  throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
}

/** 점포 상세 주소에서 확인 가능한 도로명·지번 본주소만 위치 검색에 사용합니다. */
function cuGeocodeAddress(address: string): string {
  const trimmed = address.trim();
  const base = trimmed.match(
    /^((?:[가-힣]+(?:시|도)|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s+.+?(?:(?:대로|로|길)\s+\d+(?:-\d+)?|(?:읍|면|동|리)\s+(?:산\s*)?\d+(?:-\d+)?))(?=\s|,|$)/u,
  );
  if (!base) return address;
  const detail = trimmed.slice(base[1].length);
  if (/(?:대로|로|길)\s+\d|(?:읍|면|동|리)\s+(?:산\s*)?\d/u.test(detail)) return address;
  // 층·호수·건물명·괄호 상세만 제거하고 다른 숫자 주소가 섞이면 원문을 유지합니다.
  return /^(?:\s+(?:\d+(?:층|호)|[A-Za-z가-힣][A-Za-z가-힣0-9]*|\([^)]*\)))*\s*$/u.test(detail.replace(/,/gu, ' '))
    ? base[1]
    : address;
}

export async function geocodeCuAddress(address: string, options: RequestOptions = {}) {
  const location = await geocodeLocation(cuGeocodeAddress(address), options);
  return location ? { latitude: location.latitude, longitude: location.longitude } : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function sanitizeHtmlText(value: string): string {
  const stripped = value.replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

function parseCuWebStores(html: string): CuStore[] {
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const stores: CuStore[] = [];

  for (const row of rows) {
    const nameMatch = row.match(/<span class="name">([\s\S]*?)<\/span>/);
    if (!nameMatch) {
      continue;
    }

    const phoneMatch = row.match(/<span class="tel">([\s\S]*?)<\/span>/);
    const addressMatch = row.match(/<address>[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/);
    const codeMatch = row.match(/searchLatLng\('[^']*',\s*'([^']+)'\)/);

    stores.push({
      storeCode: codeMatch?.[1] || '',
      storeName: sanitizeHtmlText(nameMatch[1]),
      phone: sanitizeHtmlText(phoneMatch?.[1] || ''),
      address: sanitizeHtmlText(addressMatch?.[1] || ''),
      latitude: 0,
      longitude: 0,
      distanceM: 0,
      stock: null,
      deliveryYn: false,
      pickupYn: false,
      reserveYn: false,
    });
  }

  return stores;
}

function normalizeCuStore(raw: NonNullable<CuStoreResponse['storeList']>[number]): CuStore {
  return {
    storeCode: raw.storeCd || '',
    storeName: raw.storeNm || '',
    phone: raw.storeTelNo || '',
    address: toStoreAddress(raw),
    latitude: toNumber(raw.latVal),
    longitude: toNumber(raw.longVal),
    distanceM: toNumber(raw.distance),
    stock: parseInventoryQuantity(raw.stock),
    deliveryYn: toYnBoolean(raw.deliveryYn) || toYnBoolean(raw.deliveryPickYn),
    pickupYn: toYnBoolean(raw.jumpoPickYn),
    reserveYn: toYnBoolean(raw.reserveYn),
  };
}

/**
 * 좌표 기반 CU 점포 목록을 조회합니다.
 */
export async function fetchCuStores(
  params: FetchCuStoresParams,
  options: RequestOptions = {},
): Promise<{ totalCount: number; stores: CuStore[] }> {
  const { timeout = 15000, apiKey } = options;
  const searchWord = (params.searchWord || '').trim();
  const hasLatitude = typeof params.latitude === 'number' && Number.isFinite(params.latitude);
  const hasLongitude = typeof params.longitude === 'number' && Number.isFinite(params.longitude);

  // 좌표가 없고 검색어가 있으면 웹 매장 검색으로 폴백합니다.
  if (searchWord.length > 0 && (!hasLatitude || !hasLongitude)) {
    const html = await requestCuWebHtml(
      CU_API.WEB_STORE_LIST_PATH,
      {
        pageIndex: '1',
        listType: '',
        jumpoCode: '',
        jumpoLotto: '',
        jumpoToto: '',
        jumpoCash: '',
        jumpoHour: '',
        jumpoCafe: '',
        jumpoDelivery: '',
        jumpoBakery: '',
        jumpoFry: '',
        jumpoMultiDevice: '',
        jumpoPosCash: '',
        jumpoBattery: '',
        jumpoAdderss: '',
        jumpoSido: '',
        jumpoGugun: '',
        jumpodong: '',
        searchWord,
      },
      apiKey,
      timeout,
    );
    const stores = parseCuWebStores(html);
    return {
      totalCount: stores.length,
      stores,
    };
  }

  const latitude = hasLatitude ? (params.latitude as number) : 37.5665;
  const longitude = hasLongitude ? (params.longitude as number) : 126.978;

  const payload = {
    latVal: String(latitude),
    longVal: String(longitude),
    baseLatVal: String(latitude),
    baseLongVal: String(longitude),
    tabId: '2',
    filterSvcList: [],
    filterAdtList: [],
    stockCdcYn: 'N',
    searchStock: false,
    pickupType: 'change',
    getRoute: 'IOS',
    areaTplNo: '0',
    childMealPickUpYn: 'N',
    isCurrentSearch: 'N',
    pageType: params.pageType || 'search_improve',
    searchWord,
    isRecommend: params.isRecommend || '',
    recommendId: params.recommendId || '',
    jipCd: params.jipCd || params.itemCd || '',
    itemCd: params.itemCd || '',
    item_cd: params.itemCd || '',
    onItemNo: params.onItemNo || '',
  };

  const body = await requestCuJson<CuStoreResponse>(CU_API.STORE_PATH, payload, options);
  const stores = (body.storeList || []).map((store) => normalizeCuStore(store));

  return {
    totalCount: toNumber(body.totalCnt) || stores.length,
    stores,
  };
}

/**
 * 재고 검색 전 초기 화면 데이터를 조회합니다.
 * 정책 변경 시 사전 호출이 필요한 경우를 대비한 워밍업 요청입니다.
 */
export async function primeCuStockDisplay(options: RequestOptions = {}): Promise<void> {
  if (hasConvenienceRelay(options)) {
    await requestConvenienceRelay('cu-prime', {}, options, options.timeout);
    return;
  }
  await fetchJson(`${CU_API.BASE_URL}${CU_API.STOCK_DISPLAY_PATH}`, {
    method: 'POST',
    timeout: options.timeout,
    headers: CU_DEFAULT_HEADERS,
    body: '{}',
  });
}

/**
 * CU 상품 재고 검색 결과를 조회합니다.
 */
export async function fetchCuStock(
  params: FetchCuStockParams,
  options: RequestOptions = {},
): Promise<{
  available: boolean;
  unavailableReason: string | null;
  totalCount: number;
  spellModifyYn: string;
  items: CuStockItem[];
}> {
  try {
    await primeCuStockDisplay(options);
  } catch {
    // 사전 워밍업 실패는 본 검색으로 재시도합니다.
  }

  const payload = {
    searchWord: params.keyword,
    prevSearchWord: '',
    spellModifyUseYn: 'Y',
    offset: params.offset,
    limit: params.limit,
    searchSort: params.searchSort,
  };

  let body: CuStockMainResponse;
  try {
    body = await requestCuJson<CuStockMainResponse>(CU_API.STOCK_MAIN_PATH, payload, options);
  } catch (error) {
    const unavailableReason = cuStockUnavailableReason(error);
    if (unavailableReason) {
      return {
        available: false,
        unavailableReason,
        totalCount: 0,
        spellModifyYn: 'N',
        items: [],
      };
    }
    throw error;
  }

  if (body.resp_cd === '3000') {
    throw new Error('CU 재고 API가 조회 실패 응답을 반환했습니다 (3000).');
  }
  const result = body.data?.stockResult?.result;
  const rows = result?.rows || [];

  const items = rows
    .map((row) => row.fields)
    .filter((fields): fields is NonNullable<typeof fields> => Boolean(fields))
    .map((fields) => ({
      itemCode: fields.item_cd || '',
      onItemNo: fields.on_item_no || '',
      itemName: fields.item_nm || '',
      price: toNumber(fields.hyun_maega),
      pickupYn: toYnBoolean(fields.pickup_yn),
      deliveryYn: toYnBoolean(fields.deliv_yn),
      reserveYn: toYnBoolean(fields.reserv_yn),
    }));

  return {
    available: true,
    unavailableReason: null,
    totalCount: toNumber(result?.total_count) || items.length,
    spellModifyYn: body.spellModifyYn || 'N',
    items,
  };
}
