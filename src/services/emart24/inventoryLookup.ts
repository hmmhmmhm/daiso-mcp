/**
 * 이마트24 재고 조회 공통 로직
 */

import {
  calculateDistanceM,
  fetchEmart24StoreDetail,
  fetchEmart24Stores,
  searchEmart24Products,
  searchEmart24StockByStores,
} from './client.js';
import type { Emart24Product, Emart24Store, Emart24StoreInventory } from './types.js';

export interface Emart24InventoryLookupArgs {
  pluCd?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  storeKeyword?: string;
  area1?: string;
  area2?: string;
  service24h?: boolean;
  productPage?: number;
  productPageSize?: number;
  storeLimit?: number;
  timeoutMs?: number;
  bizNos?: string[];
  includeRequestedStoresWithoutQty?: boolean;
}

export interface Emart24InventoryLookupResult {
  keyword: string;
  pluCd: string;
  productCandidates: Emart24Product[];
  location: { latitude: number; longitude: number } | null;
  storeFilters: {
    storeKeyword: string;
    appliedStoreKeyword: string;
    area1: string;
    area2: string;
    service24h: boolean;
    storeLimit: number;
    directBizNos: string[];
  };
  nearbyStores: {
    totalCount: number;
    stores: Emart24Store[];
  };
  inventory: {
    goodsInfo: unknown | null;
    count: number;
    stores: Emart24StoreInventory[];
  };
}

async function resolvePluCd(
  pluCd: string | undefined,
  keyword: string,
  productPage: number,
  productPageSize: number,
  timeoutMs: number,
): Promise<{ pluCd: string; products: Emart24Product[] }> {
  const normalizedPluCd = (pluCd || '').trim();
  if (normalizedPluCd.length > 0) {
    return {
      pluCd: normalizedPluCd,
      products: [],
    };
  }

  if (keyword.trim().length === 0) {
    throw new Error('pluCd 또는 keyword 중 하나는 반드시 입력해주세요.');
  }

  const productResult = await searchEmart24Products(
    {
      keyword,
      page: productPage,
      pageSize: productPageSize,
    },
    {
      timeout: timeoutMs,
    },
  );

  const firstProduct = productResult.products.find((item) => item.pluCd.trim().length > 0);
  if (!firstProduct) {
    throw new Error('상품 검색 결과에서 PLU 코드를 찾을 수 없습니다.');
  }

  return {
    pluCd: firstProduct.pluCd,
    products: productResult.products,
  };
}

function sortStoresByDistance(
  stores: Emart24Store[],
  latitude: number | undefined,
  longitude: number | undefined,
): Emart24Store[] {
  return [...stores]
    .map((store) => {
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        store.latitude === 0 ||
        store.longitude === 0
      ) {
        return store;
      }

      return {
        ...store,
        distanceM: calculateDistanceM(latitude, longitude, store.latitude, store.longitude),
      };
    })
    .sort((a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER));
}

export async function lookupEmart24Inventory(
  args: Emart24InventoryLookupArgs,
): Promise<Emart24InventoryLookupResult> {
  const {
    pluCd,
    keyword = '',
    latitude,
    longitude,
    storeKeyword = '',
    area1 = '',
    area2 = '',
    service24h = false,
    productPage = 1,
    productPageSize = 10,
    storeLimit = 10,
    timeoutMs = 15000,
    bizNos = [],
    includeRequestedStoresWithoutQty = false,
  } = args;

  const resolved = await resolvePluCd(pluCd, keyword, productPage, productPageSize, timeoutMs);
  const normalizedBizNos = [...new Set(bizNos.map((value) => value.trim()).filter((value) => value.length > 0))];

  let nearbyStores: Emart24Store[] = [];
  let nearbyTotalCount = normalizedBizNos.length;
  let appliedStoreKeyword = storeKeyword;

  if (normalizedBizNos.length === 0) {
    const nearbyStoreResult = await fetchEmart24Stores(
      {
        keyword: storeKeyword,
        area1,
        area2,
        service24h,
        page: 1,
      },
      {
        timeout: timeoutMs,
      },
    );

    appliedStoreKeyword = nearbyStoreResult.appliedKeyword;
    nearbyTotalCount = nearbyStoreResult.totalCount;
    nearbyStores = sortStoresByDistance(nearbyStoreResult.stores, latitude, longitude).slice(0, storeLimit);
  }

  const requestedBizNos = normalizedBizNos.length > 0 ? normalizedBizNos : nearbyStores.map((store) => store.storeCode);
  const stockResult = await searchEmart24StockByStores(
    {
      pluCd: resolved.pluCd,
      bizNos: requestedBizNos,
    },
    {
      timeout: timeoutMs,
    },
  );

  const qtyByBizNo = new Map(
    (stockResult.storeGoodsQty || []).map((item) => [
      String(item.BIZNO || '').trim(),
      Number.parseInt(String(item.BIZQTY || 0), 10) || 0,
    ]),
  );

  const inventoryBizNos =
    includeRequestedStoresWithoutQty && requestedBizNos.length > 0
      ? requestedBizNos
      : (stockResult.storeGoodsQty || [])
          .map((item) => String(item.BIZNO || '').trim())
          .filter((value) => value.length > 0);

  const detailResults = await Promise.allSettled(
    inventoryBizNos.map((bizNo) => fetchEmart24StoreDetail(bizNo, { timeout: timeoutMs })),
  );

  const nearbyStoreByCode = new Map(nearbyStores.map((store) => [store.storeCode, store]));
  const stores: Emart24StoreInventory[] = inventoryBizNos.map((bizNo, index) => {
    const detail = detailResults[index];
    const detailInfo = detail.status === 'fulfilled' ? detail.value.storeInfo : undefined;
    const nearby = nearbyStoreByCode.get(bizNo);

    return {
      bizNo,
      bizQty: qtyByBizNo.get(bizNo) ?? 0,
      storeName: detailInfo?.storeNm || nearby?.storeName || '',
      address: detailInfo?.storeAddr || nearby?.address || '',
      phone: detailInfo?.tel || nearby?.phone || '',
      distanceM: nearby?.distanceM ?? null,
    };
  });

  return {
    keyword,
    pluCd: resolved.pluCd,
    productCandidates: resolved.products,
    location:
      typeof latitude === 'number' && typeof longitude === 'number'
        ? { latitude, longitude }
        : null,
    storeFilters: {
      storeKeyword,
      appliedStoreKeyword,
      area1,
      area2,
      service24h,
      storeLimit,
      directBizNos: normalizedBizNos,
    },
    nearbyStores: {
      totalCount: nearbyTotalCount,
      stores: nearbyStores,
    },
    inventory: {
      goodsInfo: stockResult.storeGoodsInfo || null,
      count: stores.length,
      stores,
    },
  };
}
