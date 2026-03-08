/**
 * 이마트24 주변 매장 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { calculateDistanceM, fetchEmart24Stores } from '../client.js';

interface FindNearbyStoresArgs {
  latitude?: number;
  longitude?: number;
  keyword?: string;
  area1?: string;
  area2?: string;
  service24h?: boolean;
  page?: number;
  limit?: number;
  timeoutMs?: number;
}

async function findNearbyStores(args: FindNearbyStoresArgs): Promise<McpToolResponse> {
  const {
    latitude,
    longitude,
    keyword = '',
    area1 = '',
    area2 = '',
    service24h = false,
    page = 1,
    limit = 20,
    timeoutMs = 15000,
  } = args;

  const result = await fetchEmart24Stores(
    {
      keyword,
      area1,
      area2,
      service24h,
      page,
    },
    {
      timeout: timeoutMs,
    },
  );

  const withDistance = result.stores.map((store) => {
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
  });

  const sortedStores = [...withDistance].sort(
    (a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER),
  );

  const stores = sortedStores.slice(0, limit);

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
            area1,
            area2,
            service24h,
            totalCount: result.totalCount,
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
    name: 'emart24_find_nearby_stores',
    metadata: {
      title: '이마트24 주변 매장 탐색',
      description: '키워드/지역 조건으로 이마트24 매장을 조회하고 좌표가 있으면 거리순으로 정렬합니다.',
      inputSchema: {
        latitude: z.number().optional().describe('위도 (선택)'),
        longitude: z.number().optional().describe('경도 (선택)'),
        keyword: z.string().optional().describe('매장명/지역 키워드 (예: 강남)'),
        area1: z.string().optional().describe('시/도 (예: 서울특별시)'),
        area2: z.string().optional().describe('구/군 (예: 강남구)'),
        service24h: z.boolean().optional().default(false).describe('24시간 매장만 조회할지 여부'),
        page: z.number().optional().default(1).describe('조회 페이지 (기본값: 1)'),
        limit: z.number().optional().default(20).describe('반환할 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: findNearbyStores as (args: unknown) => Promise<McpToolResponse>,
  };
}
