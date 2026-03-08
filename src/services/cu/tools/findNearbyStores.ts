/**
 * CU 주변 매장 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCuStores } from '../client.js';

interface FindNearbyStoresArgs {
  latitude?: number;
  longitude?: number;
  keyword?: string;
  limit?: number;
  timeoutMs?: number;
}

async function findNearbyStores(args: FindNearbyStoresArgs): Promise<McpToolResponse> {
  const {
    latitude,
    longitude,
    keyword = '',
    limit = 20,
    timeoutMs = 15000,
  } = args;

  const { totalCount, stores } = await fetchCuStores(
    {
      latitude,
      longitude,
      searchWord: keyword,
    },
    {
      timeout: timeoutMs,
    },
  );

  const limitedStores = stores.slice(0, limit);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            location:
              typeof latitude === 'number' && typeof longitude === 'number'
                ? { latitude, longitude }
                : null,
            keyword,
            totalCount,
            count: limitedStores.length,
            stores: limitedStores,
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
    name: 'cu_find_nearby_stores',
    metadata: {
      title: 'CU 주변 매장 탐색',
      description: '위치(위도/경도)와 키워드로 CU 매장을 검색합니다.',
      inputSchema: {
        latitude: z.number().optional().describe('위도 (없으면 키워드 기반 검색)'),
        longitude: z.number().optional().describe('경도 (없으면 키워드 기반 검색)'),
        keyword: z.string().optional().describe('매장 검색 키워드 (예: 강남, 명동, 안산)'),
        limit: z.number().optional().default(20).describe('반환할 최대 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: findNearbyStores as (args: unknown) => Promise<McpToolResponse>,
  };
}
