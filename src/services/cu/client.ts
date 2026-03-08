/**
 * CU API 클라이언트
 */

import { fetchJson } from '../../utils/http.js';
import { decodeBase64, requestByZyte } from '../../utils/zyte.js';
import { CU_API } from './api.js';
import type { CuStockItem, CuStockMainResponse, CuStore, CuStoreResponse } from './types.js';

interface RequestOptions {
  timeout?: number;
  apiKey?: string;
}

interface FetchCuStoresParams {
  latitude?: number;
  longitude?: number;
  searchWord?: string;
  itemCd?: string;
}

interface FetchCuStockParams {
  keyword: string;
  limit: number;
  offset: number;
  searchSort: string;
}

const CU_DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
} as const;

const CU_WEB_DEFAULT_HEADERS = {
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

async function requestCuJson<T>(path: string, body: Record<string, unknown>, timeout = 15000): Promise<T> {
  return fetchJson<T>(`${CU_API.BASE_URL}${path}`, {
    method: 'POST',
    timeout,
    headers: CU_DEFAULT_HEADERS,
    body: JSON.stringify(body),
  });
}

async function requestCuWebHtml(
  path: string,
  body: Record<string, string>,
  apiKey?: string,
  timeout = 15000,
): Promise<string> {
  const form = new URLSearchParams(body);
  const formText = form.toString();
  const targetUrl = `${CU_API.WEB_BASE_URL}${path}`;
  const response = await fetch(`${CU_API.WEB_BASE_URL}${path}`, {
    method: 'POST',
    headers: CU_WEB_DEFAULT_HEADERS,
    body: formText,
    signal: AbortSignal.timeout(timeout),
  });

  if (response.ok) {
    return response.text();
  }

  if (response.status === 400 || response.status === 403 || response.status === 429) {
    try {
      const result = await requestByZyte({
        apiKey,
        url: targetUrl,
        timeout,
        method: 'POST',
        headers: Object.entries(CU_WEB_DEFAULT_HEADERS).map(([name, value]) => ({ name, value })),
        bodyText: formText,
      });

      if (result.statusCode === 200 && result.httpResponseBody) {
        return decodeBase64(result.httpResponseBody);
      }
    } catch {
      // 직접 호출 실패 시 Zyte 재시도도 실패하면 원본 에러를 반환합니다.
    }
  }

  throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
      stock: 0,
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
    stock: toNumber(raw.stock),
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
    searchWord,
    itemCd: params.itemCd || '',
    item_cd: params.itemCd || '',
    onItemNo: '',
  };

  const body = await requestCuJson<CuStoreResponse>(CU_API.STORE_PATH, payload, timeout);
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
  const { timeout = 15000 } = options;
  await requestCuJson(CU_API.STOCK_DISPLAY_PATH, {}, timeout);
}

/**
 * CU 상품 재고 검색 결과를 조회합니다.
 */
export async function fetchCuStock(
  params: FetchCuStockParams,
  options: RequestOptions = {},
): Promise<{ totalCount: number; spellModifyYn: string; items: CuStockItem[] }> {
  const { timeout = 15000 } = options;

  try {
    await primeCuStockDisplay({ timeout });
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

  const body = await requestCuJson<CuStockMainResponse>(CU_API.STOCK_MAIN_PATH, payload, timeout);

  const result = body.data?.stockResult?.result;
  const rows = result?.rows || [];

  const items = rows
    .map((row) => row.fields)
    .filter((fields): fields is NonNullable<typeof fields> => Boolean(fields))
    .map((fields) => ({
      itemCode: fields.item_cd || '',
      itemName: fields.item_nm || '',
      price: toNumber(fields.hyun_maega),
      pickupYn: toYnBoolean(fields.pickup_yn),
      deliveryYn: toYnBoolean(fields.deliv_yn),
      reserveYn: toYnBoolean(fields.reserv_yn),
    }));

  return {
    totalCount: toNumber(result?.total_count) || items.length,
    spellModifyYn: body.spellModifyYn || 'N',
    items,
  };
}
