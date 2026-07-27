/**
 * CU 재고 확인 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCuStock, fetchCuStores, geocodeCuAddress } from '../client.js';

interface CheckInventoryArgs {
  keyword: string;
  latitude?: number;
  longitude?: number;
  storeKeyword?: string;
  size?: number;
  offset?: number;
  searchSort?: string;
  storeLimit?: number;
  timeoutMs?: number;
  zyteApiKey?: string;
  googleMapsApiKey?: string;
}

interface CuInventoryToolOptions {
  zyteApiKey?: string;
  googleMapsApiKey?: string;
}

async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    keyword,
    latitude,
    longitude,
    storeKeyword = '',
    size = 20,
    offset = 0,
    searchSort = 'recom',
    storeLimit = 10,
    timeoutMs = 15000,
    zyteApiKey,
    googleMapsApiKey,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const stockResult = await fetchCuStock(
    {
      keyword,
      limit: size,
      offset,
      searchSort,
    },
    {
      timeout: timeoutMs,
      apiKey: zyteApiKey,
    },
  );

  const firstStockItem = stockResult.items.find((item) => item.itemCode.trim().length > 0) || null;
  const hasInputLocation = typeof latitude === 'number' && typeof longitude === 'number';
  const resolvedLatitude = hasInputLocation ? latitude : undefined;
  const resolvedLongitude = hasInputLocation ? longitude : undefined;
  let storeResult: Awaited<ReturnType<typeof fetchCuStores>> | null =
    storeLimit <= 0 ? { totalCount: 0, stores: [] } : null;
  let storeUnavailableReason: string | null = null;

  try {
    // 좌표 미입력 + 매장 키워드 입력 시, 키워드 기반 매장 검색 결과를 우선 사용합니다.
    if (!storeResult && !hasInputLocation && storeKeyword.trim().length > 0) {
      const keywordStoreResult = await fetchCuStores(
        {
          searchWord: storeKeyword,
        },
        {
          timeout: timeoutMs,
          apiKey: zyteApiKey,
        },
      );
      const firstAddress =
        keywordStoreResult.stores.find((store) => store.address.trim().length > 0)?.address || '';
      if (firstAddress.length > 0) {
        const geocoded = await geocodeCuAddress(firstAddress, {
          timeout: timeoutMs,
          googleMapsApiKey: googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY,
        });
        if (geocoded) {
          const hasStockSeed = !!firstStockItem?.itemCode;
          storeResult = await fetchCuStores(
            {
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
              searchWord: storeKeyword,
              itemCd: firstStockItem?.itemCode || '',
              onItemNo: firstStockItem?.onItemNo || '',
              jipCd: firstStockItem?.itemCode || '',
              isRecommend: hasStockSeed ? 'Y' : '',
              recommendId: hasStockSeed ? 'stock' : '',
              pageType: hasStockSeed ? 'search_improve stock_sch_improve' : 'search_improve',
            },
            {
              timeout: timeoutMs,
              apiKey: zyteApiKey,
            },
          );
        }
      }
      storeResult ||= keywordStoreResult;
    }

    if (!storeResult) {
      const hasStockSeed = !!firstStockItem?.itemCode;
      storeResult = await fetchCuStores(
        {
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
          searchWord: storeKeyword,
          itemCd: firstStockItem?.itemCode || '',
          onItemNo: firstStockItem?.onItemNo || '',
          jipCd: firstStockItem?.itemCode || '',
          isRecommend: hasStockSeed ? 'Y' : '',
          recommendId: hasStockSeed ? 'stock' : '',
          pageType: hasStockSeed ? 'search_improve stock_sch_improve' : 'search_improve',
        },
        {
          timeout: timeoutMs,
          apiKey: zyteApiKey,
        },
      );
    }
  } catch (error) {
    storeUnavailableReason =
      error instanceof Error ? error.message : 'CU 매장 조회 중 알 수 없는 오류가 발생했습니다.';
    storeResult = { totalCount: 0, stores: [] };
  }

  storeResult ||= { totalCount: 0, stores: [] };
  const limitedStores = storeResult.stores.slice(0, storeLimit);

  const result = {
    keyword,
    searchOptions: {
      size,
      offset,
      searchSort,
      storeKeyword,
    },
    location:
      typeof resolvedLatitude === 'number' && typeof resolvedLongitude === 'number'
        ? { latitude: resolvedLatitude, longitude: resolvedLongitude }
        : null,
    nearbyStores: {
      available: storeUnavailableReason === null,
      unavailableReason: storeUnavailableReason,
      totalCount: storeResult.totalCount,
      count: limitedStores.length,
      stockItemCode: firstStockItem?.itemCode || null,
      stockItemName: firstStockItem?.itemName || null,
      stores: limitedStores,
    },
    inventory: {
      available: stockResult.available,
      unavailableReason: stockResult.unavailableReason,
      totalCount: stockResult.totalCount,
      count: stockResult.items.length,
      spellModifyYn: stockResult.spellModifyYn,
      items: stockResult.items,
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createCheckInventoryTool(options: CuInventoryToolOptions = {}): ToolRegistration {
  return {
    name: 'cu_check_inventory',
    metadata: {
      title: 'CU 재고 확인',
      description: '상품 키워드로 CU 재고를 조회하고 주변 매장 정보를 함께 반환합니다.',
      inputSchema: {
        keyword: z.string().describe('재고를 확인할 상품 검색어 (예: 과자, 커피, 도시락)'),
        latitude: z.number().optional().describe('위도 (없으면 storeKeyword 기반으로 좌표 추정 시도)'),
        longitude: z.number().optional().describe('경도 (없으면 storeKeyword 기반으로 좌표 추정 시도)'),
        storeKeyword: z.string().optional().describe('주변 매장 필터 키워드 (예: 강남, 안산)'),
        size: z.number().optional().default(20).describe('재고 검색 결과 수 (기본값: 20)'),
        offset: z.number().optional().default(0).describe('재고 검색 시작 오프셋 (기본값: 0)'),
        searchSort: z.string().optional().default('recom').describe('재고 정렬 방식 (기본값: recom)'),
        storeLimit: z.number().optional().default(10).describe('반환할 주변 매장 최대 수 (기본값: 10)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args: CheckInventoryArgs) =>
      checkInventory({
        ...args,
        zyteApiKey: options.zyteApiKey ?? args.zyteApiKey,
        googleMapsApiKey: options.googleMapsApiKey ?? args.googleMapsApiKey,
      })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
