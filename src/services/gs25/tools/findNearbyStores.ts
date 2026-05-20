/**
 * GS25 주변 매장 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import {
  attachDistanceToGs25Stores,
  fetchGs25Stores,
  geocodeGs25Address,
  selectGs25StoresForKeyword,
  sortGs25Stores,
} from '../client.js';

const FALLBACK_STORE_LOOKUP_ITEM_CODE = '8801117752804';

function getProcessEnvValue(name: string): string | undefined {
  /* c8 ignore next -- Node 테스트와 CLI 런타임은 process를 제공하며, Worker에는 API에서 키를 주입합니다. */
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

interface FindNearbyStoresArgs {
  latitude?: number;
  longitude?: number;
  keyword?: string;
  serviceCode?: string;
  limit?: number;
  timeoutMs?: number;
  googleMapsApiKey?: string;
  zyteApiKey?: string;
}

async function findNearbyStores(args: FindNearbyStoresArgs): Promise<McpToolResponse> {
  const {
    latitude,
    longitude,
    keyword = '',
    serviceCode = '01',
    limit = 20,
    timeoutMs = 20000,
    googleMapsApiKey = getProcessEnvValue('GOOGLE_MAPS_API_KEY'),
    zyteApiKey = getProcessEnvValue('ZYTE_API_KEY'),
  } = args;

  let resolvedLatitude = latitude;
  let resolvedLongitude = longitude;
  let geocodeUsed = false;

  if (
    (typeof resolvedLatitude !== 'number' || typeof resolvedLongitude !== 'number') &&
    keyword.trim().length > 0
  ) {
    const geocoded = await geocodeGs25Address(keyword, {
      timeout: timeoutMs,
      googleMapsApiKey,
    });
    if (geocoded) {
      resolvedLatitude = geocoded.latitude;
      resolvedLongitude = geocoded.longitude;
      geocodeUsed = true;
    }
  }

  let result = await fetchGs25Stores(
    {
      serviceCode,
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
    },
    {
      timeout: timeoutMs,
      zyteApiKey,
    },
  );
  let fallbackUsed = false;

  if (
    result.stores.length === 0 &&
    typeof resolvedLatitude === 'number' &&
    typeof resolvedLongitude === 'number'
  ) {
    try {
      const fallbackResult = await fetchGs25Stores(
        {
          serviceCode,
          itemCode: FALLBACK_STORE_LOOKUP_ITEM_CODE,
          realTimeStockYn: 'Y',
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
          useCache: false,
        },
        {
          timeout: timeoutMs,
          zyteApiKey,
        },
      );

      if (fallbackResult.stores.length > 0) {
        result = fallbackResult;
        fallbackUsed = true;
      }
    } catch {
      fallbackUsed = false;
    }
  }

  const selected = selectGs25StoresForKeyword(result.stores, keyword, {
    relaxWhenEmpty: typeof resolvedLatitude === 'number' && typeof resolvedLongitude === 'number',
  });
  const withDistance = attachDistanceToGs25Stores(
    selected.stores,
    resolvedLatitude,
    resolvedLongitude,
  );
  const stores = sortGs25Stores(withDistance).slice(0, limit);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            serviceCode,
            keyword,
            geocodeUsed,
            location:
              typeof resolvedLatitude === 'number' && typeof resolvedLongitude === 'number'
                ? {
                    latitude: resolvedLatitude,
                    longitude: resolvedLongitude,
                  }
                : null,
            cacheHit: result.cacheHit,
            totalCount: result.totalCount,
            filteredCount: selected.stores.length,
            filterRelaxed: selected.filterRelaxed,
            fallbackUsed,
            count: stores.length,
            stores,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createFindNearbyStoresTool(
  googleMapsApiKey?: string,
  zyteApiKey?: string,
): ToolRegistration {
  return {
    name: 'gs25_find_nearby_stores',
    metadata: {
      title: 'GS25 주변 매장 탐색',
      description: '좌표/키워드로 GS25 매장을 조회하고 거리순으로 정렬합니다.',
      inputSchema: {
        latitude: z.number().optional().describe('위도 (선택, 미입력 시 keyword 지오코딩 시도)'),
        longitude: z.number().optional().describe('경도 (선택, 미입력 시 keyword 지오코딩 시도)'),
        keyword: z.string().optional().describe('매장명/주소 키워드 (예: 강남, 안산 중앙역)'),
        serviceCode: z.string().optional().default('01').describe('서비스 코드 (기본값: 01=GS25)'),
        limit: z.number().optional().default(20).describe('반환할 최대 매장 수 (기본값: 20)'),
        timeoutMs: z
          .number()
          .optional()
          .default(20000)
          .describe('요청 제한 시간(ms, 기본값: 20000)'),
      },
    },
    handler: ((args: FindNearbyStoresArgs) =>
      findNearbyStores({
        ...args,
        googleMapsApiKey: args.googleMapsApiKey || googleMapsApiKey,
        zyteApiKey: args.zyteApiKey || zyteApiKey,
      })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
