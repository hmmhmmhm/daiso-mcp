/**
 * 롯데마트 주변 매장 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchLotteMartStores } from '../client.js';

interface FindNearbyStoresArgs {
  area?: string;
  keyword?: string;
  brandVariant?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
  timeoutMs?: number;
  googleMapsApiKey?: string;
}

async function findNearbyStores(args: FindNearbyStoresArgs): Promise<McpToolResponse> {
  const {
    area,
    keyword = '',
    brandVariant = '',
    latitude,
    longitude,
    limit = 20,
    timeoutMs = 15000,
    googleMapsApiKey,
  } = args;

  const result = await fetchLotteMartStores(
    {
      area,
      keyword,
      brandVariant,
      latitude,
      longitude,
      limit,
    },
    {
      timeout: timeoutMs,
      googleMapsApiKey,
    },
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            area: area || null,
            keyword,
            brandVariant: brandVariant || null,
            geocodeUsed: result.geocodeUsed,
            location: result.location,
            count: result.stores.length,
            stores: result.stores,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createFindNearbyStoresTool(apiKey?: string): ToolRegistration {
  return {
    name: 'lottemart_find_nearby_stores',
    metadata: {
      title: '롯데마트 주변 매장 탐색',
      description: '지역/키워드와 좌표 기준으로 롯데마트 계열 매장을 조회하고 거리순으로 정렬합니다.',
      inputSchema: {
        area: z.string().optional().describe('지역 (예: 서울, 경기, 제주)'),
        keyword: z.string().optional().describe('매장명/주소 키워드 (예: 강변, 잠실, 서울역)'),
        brandVariant: z
          .enum(['lottemart', 'toysrus', 'max', 'bottlebunker', 'mealguru', 'grandgrocery', 'other'])
          .optional()
          .describe('브랜드 변형 필터'),
        latitude: z.number().optional().describe('위도 (미입력 시 keyword 지오코딩 시도)'),
        longitude: z.number().optional().describe('경도 (미입력 시 keyword 지오코딩 시도)'),
        limit: z.number().optional().default(20).describe('반환할 최대 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args: FindNearbyStoresArgs) =>
      findNearbyStores({ ...args, googleMapsApiKey: args.googleMapsApiKey || apiKey })) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
