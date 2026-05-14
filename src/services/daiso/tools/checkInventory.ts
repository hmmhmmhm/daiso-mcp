/**
 * 재고 확인 도구
 *
 * 다이소몰 API를 사용하여 매장별 재고를 확인합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import type {
  ProductSummary,
  StoreInventory,
  StoreInventoryV2Response,
  StoreSearchV2Response,
  OnlineStockResponse,
} from '../types.js';
import { DAISOMALL_API } from '../api.js';
import { fetchDaisoJson, fetchDaisoJsonWithAuth } from '../client.js';
import { buildDaisoStoreKeywordVariants } from '../../../utils/daisoKeyword.js';
import { fetchProductById } from './getPriceInfo.js';
import { toProductSummary } from '../product.js';

/** 도구 입력 인터페이스 */
interface CheckInventoryArgs {
  productId: string;
  storeQuery?: string;
  latitude?: number;
  longitude?: number;
  page?: number;
  pageSize?: number;
}

/**
 * 재고 응답에 함께 노출할 상품 요약 정보를 조회합니다.
 * 부가 정보이므로 실패해도 전체 재고 조회는 계속 진행합니다.
 */
async function fetchInventoryProduct(productId: string): Promise<ProductSummary | undefined> {
  try {
    const product = await fetchProductById(productId);
    return product ? toProductSummary(product) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 온라인 재고 조회
 */
export async function fetchOnlineStock(productNo: string): Promise<number> {
  const data = await fetchDaisoJson<OnlineStockResponse>(DAISOMALL_API.ONLINE_STOCK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdNo: productNo }),
  });

  if (!data.success) {
    return 0;
  }

  return data.data?.stck || 0;
}

/**
 * 매장별 재고 조회
 */
export async function fetchStoreInventory(
  productNo: string,
  lat: number,
  lng: number,
  page: number = 1,
  pageSize: number = 30,
  keyword: string = ''
): Promise<{ stores: StoreInventory[]; totalCount: number }> {
  const searchKeywords = keyword ? buildDaisoStoreKeywordVariants(keyword) : [''];

  for (const searchKeyword of searchKeywords) {
    const storeSearch = await fetchDaisoJson<StoreSearchV2Response>(DAISOMALL_API.STORE_SEARCH_V2, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inclusiveStrCd: '',
        keyword: searchKeyword,
        curLttd: lat,
        curLitd: lng,
      }),
    });

    const allStores = storeSearch.data || [];
    const searchedStores = allStores.slice((page - 1) * pageSize, page * pageSize);
    if (searchedStores.length === 0) {
      if (searchKeyword === searchKeywords[searchKeywords.length - 1]) {
        return { stores: [], totalCount: 0 };
      }
      continue;
    }

    const inventoryResponse = await fetchDaisoJsonWithAuth<StoreInventoryV2Response>(
      DAISOMALL_API.STORE_INVENTORY_V2,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          searchedStores.map((store) => ({
            pdNo: productNo,
            strCd: store.strCd,
          })),
        ),
      },
    );

    const quantities = new Map(
      (inventoryResponse.data || []).map((item) => [item.strCd, parseInt(item.stck) || 0]),
    );

    const stores: StoreInventory[] = searchedStores.map((store) => ({
      storeCode: store.strCd,
      storeName: store.strNm,
      address: store.strAddr,
      phone: store.strTno,
      openTime: store.opngTime,
      closeTime: store.clsngTime,
      lat: store.strLttd,
      lng: store.strLitd,
      distance: store.km,
      quantity: quantities.get(store.strCd) ?? 0,
      options: {
        parking: store.parkYn === 'Y',
        simCard: store.usimYn === 'Y',
        pickup: store.pkupYn === 'Y',
        taxFree: store.taxfYn === 'Y',
        elevator: store.elvtYn === 'Y',
        ramp: store.entrRampYn === 'Y',
        cashless: store.nocashYn === 'Y',
      },
    }));

    return {
      stores,
      totalCount: allStores.length,
    };
  }

  /* c8 ignore next -- searchKeywords is always non-empty; this is a defensive fallback. */
  return { stores: [], totalCount: 0 };
}

/**
 * 재고 확인 핸들러
 */
async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    productId,
    storeQuery = '',
    latitude = 37.5665, // 기본값: 서울 시청
    longitude = 126.978,
    page = 1,
    pageSize = 30,
  } = args;

  if (!productId || productId.trim().length === 0) {
    throw new Error('상품 ID(productId)를 입력해주세요.');
  }

  // 온라인 재고와 매장 재고 동시 조회
  const [onlineStock, storeResult, product] = await Promise.all([
    fetchOnlineStock(productId),
    fetchStoreInventory(productId, latitude, longitude, page, pageSize, storeQuery),
    fetchInventoryProduct(productId),
  ]);

  // 재고 있는 매장과 없는 매장 분류
  const inStockStores = storeResult.stores.filter((s) => s.quantity > 0);
  const outOfStockStores = storeResult.stores.filter((s) => s.quantity === 0);

  const result = {
    productId,
    product,
    location: { latitude, longitude },
    onlineStock,
    storeInventory: {
      totalStores: storeResult.totalCount,
      inStockCount: inStockStores.length,
      outOfStockCount: outOfStockStores.length,
      page,
      pageSize,
      stores: storeResult.stores,
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * 도구 등록 정보 생성
 */
export function createCheckInventoryTool(): ToolRegistration {
  return {
    name: 'daiso_check_inventory',
    metadata: {
      title: '재고 확인',
      description:
        '특정 제품의 매장별 재고를 확인합니다. 매장명/주소 검색 또는 위치 기반으로 조회합니다.',
      inputSchema: {
        productId: z.string().describe('제품 ID (daiso_search_products로 조회한 상품의 id)'),
        storeQuery: z.string().optional().describe('매장 검색어 (매장명 또는 주소, 예: 안산 중앙역)'),
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        page: z.number().optional().default(1).describe('페이지 번호 (기본값: 1)'),
        pageSize: z.number().optional().default(30).describe('페이지당 결과 수 (기본값: 30)'),
      },
    },
    handler: checkInventory as (args: unknown) => Promise<McpToolResponse>,
  };
}
