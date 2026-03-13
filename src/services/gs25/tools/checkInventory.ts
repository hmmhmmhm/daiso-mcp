/**
 * GS25 재고 확인 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import {
  attachDistanceToGs25Stores,
  fetchGs25Stores,
  filterGs25StoresByKeyword,
  geocodeGs25Address,
  sortGs25Stores,
} from '../client.js';

interface CheckInventoryArgs {
  keyword: string;
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

  const stockResult = await fetchGs25Stores(
    {
      serviceCode,
      keyword,
      useCache: false,
    },
    {
      timeout: timeoutMs,
    },
  );

  const filteredByStoreKeyword = filterGs25StoresByKeyword(stockResult.stores, storeKeyword);
  const withDistance = attachDistanceToGs25Stores(filteredByStoreKeyword, resolvedLatitude, resolvedLongitude);
  const stores = sortGs25Stores(withDistance).slice(0, storeLimit);

  const totalInStockCount = filteredByStoreKeyword.filter((item) => item.realStockQuantity > 0).length;
  const totalStockQuantity = filteredByStoreKeyword.reduce((sum, item) => sum + Math.max(item.realStockQuantity, 0), 0);

  const firstProductName = filteredByStoreKeyword.find((item) => item.searchItemName.length > 0)?.searchItemName || null;
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
            storeKeyword,
            geocodeUsed,
            location:
              typeof resolvedLatitude === 'number' && typeof resolvedLongitude === 'number'
                ? {
                    latitude: resolvedLatitude,
                    longitude: resolvedLongitude,
                  }
                : null,
            product: {
              name: firstProductName,
              sellPrice: firstProductPrice,
            },
            inventory: {
              totalStoreCount: stockResult.totalCount,
              matchedStoreCount: filteredByStoreKeyword.length,
              inStockStoreCount: totalInStockCount,
              totalStockQuantity,
              count: stores.length,
              stores,
            },
            note:
              firstProductName === null
                ? '응답에 상품명이 없어 재고가 기본값으로 내려온 것일 수 있습니다. 키워드/시점에 따라 결과를 재확인하세요.'
                : null,
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
