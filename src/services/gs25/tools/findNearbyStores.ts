/**
 * GS25 주변 매장 탐색 도구
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

interface FindNearbyStoresArgs {
  latitude?: number;
  longitude?: number;
  keyword?: string;
  serviceCode?: string;
  limit?: number;
  timeoutMs?: number;
}

async function findNearbyStores(args: FindNearbyStoresArgs): Promise<McpToolResponse> {
  const {
    latitude,
    longitude,
    keyword = '',
    serviceCode = '01',
    limit = 20,
    timeoutMs = 20000,
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
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    });
    if (geocoded) {
      resolvedLatitude = geocoded.latitude;
      resolvedLongitude = geocoded.longitude;
      geocodeUsed = true;
    }
  }

  const result = await fetchGs25Stores(
    {
      serviceCode,
    },
    {
      timeout: timeoutMs,
    },
  );

  const filtered = filterGs25StoresByKeyword(result.stores, keyword);
  const withDistance = attachDistanceToGs25Stores(filtered, resolvedLatitude, resolvedLongitude);
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
            filteredCount: filtered.length,
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

export function createFindNearbyStoresTool(): ToolRegistration {
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
        timeoutMs: z.number().optional().default(20000).describe('요청 제한 시간(ms, 기본값: 20000)'),
      },
    },
    handler: findNearbyStores as (args: unknown) => Promise<McpToolResponse>,
  };
}
