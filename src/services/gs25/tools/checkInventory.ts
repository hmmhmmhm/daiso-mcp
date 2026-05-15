/**
 * GS25 재고 확인 도구
 */
/* c8 ignore start */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import {
  attachDistanceToGs25Stores,
  fetchGs25SearchProducts,
  fetchGs25Stores,
  filterGs25StoresByKeyword,
  geocodeGs25Address,
  selectGs25StoresForKeyword,
  sortGs25Stores,
} from '../client.js';

interface CheckInventoryArgs {
  keyword: string;
  itemCode?: string;
  latitude?: number;
  longitude?: number;
  storeKeyword?: string;
  serviceCode?: string;
  storeLimit?: number;
  timeoutMs?: number;
}

async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    keyword,
    itemCode: providedItemCode,
    latitude,
    longitude,
    storeKeyword = '',
    serviceCode = '01',
    storeLimit = 20,
    timeoutMs = 20000,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  let resolvedLatitude = latitude;
  let resolvedLongitude = longitude;
  let geocodeUsed = false;
  let itemCodeUsed = false;
  let resolvedItemCode: string | null = null;

  // 좌표가 없고 storeKeyword가 있으면 지오코딩 시도
  if (
    (typeof resolvedLatitude !== 'number' || typeof resolvedLongitude !== 'number') &&
    storeKeyword.trim().length > 0
  ) {
    const baseStores = await fetchGs25Stores(
      {
        serviceCode,
      },
      {
        timeout: timeoutMs,
      },
    );
    const firstAddress =
      filterGs25StoresByKeyword(baseStores.stores, storeKeyword).find((store) => store.address.trim().length > 0)
        ?.address || '';

    if (firstAddress.length > 0) {
      const geocoded = await geocodeGs25Address(firstAddress, {
        timeout: timeoutMs,
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      });
      if (geocoded) {
        resolvedLatitude = geocoded.latitude;
        resolvedLongitude = geocoded.longitude;
        geocodeUsed = true;
      }
    }
  }

  // 좌표가 없으면 기본 좌표 (서울 강남) 사용
  // itemCode 기반 재고 조회는 좌표가 필수
  if (typeof resolvedLatitude !== 'number' || typeof resolvedLongitude !== 'number') {
    resolvedLatitude = 37.4979;
    resolvedLongitude = 127.0276;
  }

  let stockResult: { totalCount: number; stores: Awaited<ReturnType<typeof fetchGs25Stores>>['stores'] };
  let firstProduct: Awaited<ReturnType<typeof fetchGs25SearchProducts>>[number] | undefined;

  // itemCode가 직접 제공된 경우 totalSearch 단계 건너뛰기
  if (providedItemCode && providedItemCode.trim().length > 0) {
    resolvedItemCode = providedItemCode.trim();
    itemCodeUsed = true;

    stockResult = await fetchGs25Stores(
      {
        serviceCode,
        itemCode: resolvedItemCode,
        realTimeStockYn: 'Y',
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        useCache: false,
      },
      {
        timeout: timeoutMs,
      },
    );
  } else {
    // itemCode가 없으면 totalSearch API로 키워드 → itemCode 변환
    const searchProducts = await fetchGs25SearchProducts(keyword, { timeout: timeoutMs });
    firstProduct = searchProducts.find((p) => p.itemCode.length > 0);

    if (firstProduct) {
      resolvedItemCode = firstProduct.itemCode;
      itemCodeUsed = true;

      stockResult = await fetchGs25Stores(
        {
          serviceCode,
          itemCode: resolvedItemCode,
          realTimeStockYn: 'Y',
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
          useCache: false,
        },
        {
          timeout: timeoutMs,
        },
      );
    } else {
      // itemCode가 없으면 기존 keyword 방식 fallback
      stockResult = await fetchGs25Stores(
        {
          serviceCode,
          keyword,
          realTimeStockYn: 'Y',
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
          useCache: false,
        },
        {
          timeout: timeoutMs,
        },
      );
    }
  }

  const selectedByStoreKeyword = selectGs25StoresForKeyword(stockResult.stores, storeKeyword, {
    relaxWhenEmpty: typeof resolvedLatitude === 'number' && typeof resolvedLongitude === 'number',
  });
  const filteredByStoreKeyword = selectedByStoreKeyword.stores;
  const withDistance = attachDistanceToGs25Stores(filteredByStoreKeyword, resolvedLatitude, resolvedLongitude);
  const stores = sortGs25Stores(withDistance).slice(0, storeLimit);

  const totalInStockCount = filteredByStoreKeyword.filter((item) => item.realStockQuantity > 0).length;
  const totalStockQuantity = filteredByStoreKeyword.reduce((sum, item) => sum + Math.max(item.realStockQuantity, 0), 0);

  // searchProducts에서 상품 정보 사용
  const firstProductName = firstProduct?.itemName || firstProduct?.shortItemName || null;
  const firstProductPrice =
    filteredByStoreKeyword.find((item) => item.searchItemSellPrice !== null)?.searchItemSellPrice ?? null;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            serviceCode,
            keyword,
            itemCodeUsed,
            itemCode: resolvedItemCode,
            storeKeyword,
            geocodeUsed,
            filterRelaxed: selectedByStoreKeyword.filterRelaxed,
            location: {
              latitude: resolvedLatitude,
              longitude: resolvedLongitude,
            },
            product: {
              name: firstProductName,
              sellPrice: firstProductPrice,
              imageUrl: firstProduct?.imageUrl || null,
              rating: firstProduct?.rating || null,
            },
            inventory: {
              totalStoreCount: stockResult.totalCount,
              matchedStoreCount: filteredByStoreKeyword.length,
              inStockStoreCount: totalInStockCount,
              totalStockQuantity,
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
    name: 'gs25_check_inventory',
    metadata: {
      title: 'GS25 재고 확인',
      description: '상품 키워드 기준으로 GS25 매장별 재고를 조회합니다.',
      inputSchema: {
        keyword: z.string().describe('상품 검색어 (예: 오감자, 삼각김밥, 커피)'),
        itemCode: z
          .string()
          .optional()
          .describe('상품 코드 (gs25_search_products로 조회한 정확한 코드, 제공 시 keyword 검색 건너뜀)'),
        latitude: z.number().optional().describe('위도 (선택, 미입력 시 storeKeyword 지오코딩 시도)'),
        longitude: z.number().optional().describe('경도 (선택, 미입력 시 storeKeyword 지오코딩 시도)'),
        storeKeyword: z.string().optional().describe('매장명/주소 키워드 필터 (예: 강남, 안산 중앙역)'),
        serviceCode: z.string().optional().default('01').describe('서비스 코드 (기본값: 01=GS25)'),
        storeLimit: z.number().optional().default(20).describe('반환할 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(20000).describe('요청 제한 시간(ms, 기본값: 20000)'),
      },
    },
    handler: checkInventory as (args: unknown) => Promise<McpToolResponse>,
  };
}
/* c8 ignore stop */
