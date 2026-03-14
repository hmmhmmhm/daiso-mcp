/**
 * 세븐일레븐 매장 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchSevenElevenStoresByKeyword } from '../client.js';

interface SearchStoresArgs {
  keyword: string;
  limit?: number;
  timeoutMs?: number;
}

async function searchStores(args: SearchStoresArgs): Promise<McpToolResponse> {
  const { keyword, limit = 20, timeoutMs = 15000 } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('매장 검색어(keyword)를 입력해주세요.');
  }

  const result = await fetchSevenElevenStoresByKeyword(
    {
      keyword,
      limit,
    },
    {
      timeout: timeoutMs,
    },
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            keyword: result.query,
            totalCount: result.totalCount,
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

export function createSearchStoresTool(): ToolRegistration {
  return {
    name: 'seveneleven_search_stores',
    metadata: {
      title: '세븐일레븐 매장 검색',
      description: '키워드로 세븐일레븐 매장을 검색합니다.',
      inputSchema: {
        keyword: z.string().describe('매장명/지역 키워드 (예: 안산 중앙역, 강남)'),
        limit: z.number().optional().default(20).describe('반환할 최대 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: searchStores as (args: unknown) => Promise<McpToolResponse>,
  };
}
