/**
 * 네이버 지역 검색 기반 주변 장소 탐색 도구
 */
import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { searchNaverLocalPlaces } from '../client.js';
import type { PlaceCategory } from '../types.js';

interface SearchNearbyPlacesArgs {
  location?: string;
  keyword?: string;
  category?: PlaceCategory;
  limit?: number;
  start?: number;
  sort?: 'random' | 'comment';
  timeoutMs?: number;
  naverClientId?: string;
  naverClientSecret?: string;
}

async function searchNearbyPlaces(args: SearchNearbyPlacesArgs): Promise<McpToolResponse> {
  const result = await searchNaverLocalPlaces(args);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

export function createSearchNearbyPlacesTool(
  naverClientId?: string,
  naverClientSecret?: string,
): ToolRegistration {
  return {
    name: 'places_search_nearby',
    metadata: {
      title: '주변 음식점/카페 검색',
      description:
        '네이버 지역 검색으로 특정 지역의 음식점, 카페, 디저트 가게 등 주변 장소를 키워드 기반으로 찾습니다.',
      inputSchema: {
        location: z.string().optional().describe('지역/역/주소 키워드 (예: 강남역, 성수동)'),
        keyword: z.string().optional().describe('검색어 (예: 라멘, 브런치, 조용한 카페)'),
        category: z
          .enum(['restaurant', 'cafe', 'food', 'dessert', 'all'])
          .optional()
          .default('all')
          .describe('장소 카테고리. restaurant/food=음식점, cafe=카페, dessert=디저트'),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe('반환할 최대 장소 수 (네이버 지역 검색 최대 5)'),
        start: z.number().optional().default(1).describe('검색 시작 위치 (기본값: 1)'),
        sort: z
          .enum(['random', 'comment'])
          .optional()
          .default('random')
          .describe('정렬 방식. random=유사도순, comment=리뷰순'),
        timeoutMs: z
          .number()
          .optional()
          .default(10000)
          .describe('요청 제한 시간(ms, 기본값: 10000)'),
      },
    },
    handler: ((args: SearchNearbyPlacesArgs) =>
      searchNearbyPlaces({
        ...args,
        naverClientId: args.naverClientId || naverClientId,
        naverClientSecret: args.naverClientSecret || naverClientSecret,
      })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
