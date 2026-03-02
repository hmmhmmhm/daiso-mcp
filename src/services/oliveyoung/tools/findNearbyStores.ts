/**
 * 올리브영 주변 매장 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchOliveyoungStores } from '../client.js';

interface FindNearbyStoresArgs {
  latitude?: number;
  longitude?: number;
  keyword?: string;
  pageIdx?: number;
  limit?: number;
  timeoutMs?: number;
  zyteApiKey?: string;
}

async function findNearbyStores(args: FindNearbyStoresArgs): Promise<McpToolResponse> {
  const {
    latitude = 37.5665,
    longitude = 126.978,
    keyword = '',
    pageIdx = 1,
    limit = 20,
    timeoutMs = 15000,
    zyteApiKey,
  } = args;

  const { totalCount, stores } = await fetchOliveyoungStores(
    {
      latitude,
      longitude,
      pageIdx,
      searchWords: keyword,
    },
    {
      timeout: timeoutMs,
      apiKey: zyteApiKey,
    }
  );

  const limitedStores = stores.slice(0, limit);

  const result = {
    location: {
      latitude,
      longitude,
    },
    keyword,
    pageIdx,
    totalCount,
    count: limitedStores.length,
    stores: limitedStores,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createFindNearbyStoresTool(apiKey?: string): ToolRegistration {
  return {
    name: 'oliveyoung_find_nearby_stores',
    metadata: {
      title: '올리브영 주변 매장 탐색',
      description: '위치(위도/경도)와 키워드로 내 주변 올리브영 매장을 조회합니다.',
      inputSchema: {
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        keyword: z
          .string()
          .optional()
          .describe('매장 검색어 (예: 강남, 명동, 신촌). 비우면 주변 매장 전체 조회'),
        pageIdx: z.number().optional().default(1).describe('매장 결과 페이지 번호 (기본값: 1)'),
        limit: z.number().optional().default(20).describe('반환할 최대 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args: FindNearbyStoresArgs) =>
      findNearbyStores({ ...args, zyteApiKey: apiKey })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
