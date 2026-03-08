/**
 * 이마트24 재고 확인 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import {
  calculateDistanceM,
  fetchEmart24StoreDetail,
  fetchEmart24Stores,
  searchEmart24Products,
  searchEmart24StockByStores,
} from '../client.js';
import type { Emart24StoreInventory } from '../types.js';

interface CheckInventoryArgs {
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
}

async function resolvePluCd(
  pluCd: string | undefined,
  keyword: string,
  productPage: number,
  productPageSize: number,
  timeoutMs: number,
): Promise<{ pluCd: string; products: Awaited<ReturnType<typeof searchEmart24Products>>['products'] }> {
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

async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
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
  } = args;

  const resolved = await resolvePluCd(pluCd, keyword, productPage, productPageSize, timeoutMs);

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

  const sortedStores = [...nearbyStoreResult.stores]
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

  const targetStores = sortedStores.filter((store) => store.storeCode.length > 0).slice(0, storeLimit);
  const stockResult = await searchEmart24StockByStores(
    {
      pluCd: resolved.pluCd,
      bizNos: targetStores.map((store) => store.storeCode),
    },
    {
      timeout: timeoutMs,
    },
  );

  const storeDetailResults = await Promise.allSettled(
    (stockResult.storeGoodsQty || []).map((item) => fetchEmart24StoreDetail(item.BIZNO || '', { timeout: timeoutMs })),
  );

  const storeByCode = new Map(targetStores.map((store) => [store.storeCode, store]));

  const stores: Emart24StoreInventory[] = (stockResult.storeGoodsQty || []).map((item, index) => {
    const bizNo = String(item.BIZNO || '').trim();
    const detail = storeDetailResults[index];
    const detailInfo = detail.status === 'fulfilled' ? detail.value.storeInfo : undefined;
    const nearby = storeByCode.get(bizNo);

    const distanceM =
      nearby?.distanceM ??
      (typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      nearby &&
      nearby.latitude !== 0 &&
      nearby.longitude !== 0
        ? calculateDistanceM(latitude, longitude, nearby.latitude, nearby.longitude)
        : null);

    return {
      bizNo,
      bizQty: Number.parseInt(String(item.BIZQTY || 0), 10) || 0,
      storeName: detailInfo?.storeNm || nearby?.storeName || '',
      address: detailInfo?.storeAddr || nearby?.address || '',
      phone: detailInfo?.tel || nearby?.phone || '',
      distanceM,
    };
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            keyword,
            pluCd: resolved.pluCd,
            productCandidates: resolved.products,
            location:
              typeof latitude === 'number' && typeof longitude === 'number'
                ? { latitude, longitude }
                : null,
            storeFilters: {
              storeKeyword,
              area1,
              area2,
              service24h,
              storeLimit,
            },
            nearbyStores: {
              totalCount: nearbyStoreResult.totalCount,
              stores: targetStores,
            },
            inventory: {
              goodsInfo: stockResult.storeGoodsInfo || null,
              count: stores.length,
              stores,
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createCheckInventoryTool(): ToolRegistration {
  return {
    name: 'emart24_check_inventory',
    metadata: {
      title: '이마트24 재고 확인',
      description: 'PLU 코드 또는 상품 키워드로 매장별 재고 수량을 조회합니다.',
      inputSchema: {
        pluCd: z.string().optional().describe('상품 PLU 코드 (예: 8800244010504)'),
        keyword: z.string().optional().describe('상품 검색어 (pluCd 미입력 시 필수)'),
        latitude: z.number().optional().describe('위도 (선택)'),
        longitude: z.number().optional().describe('경도 (선택)'),
        storeKeyword: z.string().optional().describe('매장 키워드 필터 (예: 강남)'),
        area1: z.string().optional().describe('시/도 (예: 서울특별시)'),
        area2: z.string().optional().describe('구/군 (예: 강남구)'),
        service24h: z.boolean().optional().default(false).describe('24시간 매장만 대상으로 조회'),
        productPage: z.number().optional().default(1).describe('상품 검색 페이지 (기본값: 1)'),
        productPageSize: z.number().optional().default(10).describe('상품 검색 수 (기본값: 10)'),
        storeLimit: z.number().optional().default(10).describe('조회할 매장 수 (기본값: 10)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: checkInventory as (args: unknown) => Promise<McpToolResponse>,
  };
}
