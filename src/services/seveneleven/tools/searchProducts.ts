/**
 * 세븐일레븐 상품 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { searchSevenElevenProducts } from '../client.js';

interface SearchProductsArgs {
  query: string;
  page?: number;
  size?: number;
  sort?: 'recommend' | 'recent' | 'popular';
  timeoutMs?: number;
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const { query, page = 1, size = 20, sort = 'recommend', timeoutMs = 15000 } = args;

  if (!query || query.trim().length === 0) {
    throw new Error('상품 검색어(query)를 입력해주세요.');
  }

  const result = await searchSevenElevenProducts(
    {
      query,
      page,
      size,
      sort,
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
            query: result.query,
            page,
            size,
            sort,
            totalCount: result.totalCount,
            count: result.products.length,
            collectionIds: result.collectionIds,
            products: result.products,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createSearchProductsTool(): ToolRegistration {
  return {
    name: 'seveneleven_search_products',
    metadata: {
      title: '세븐일레븐 상품 검색',
      description: '키워드로 세븐일레븐 상품을 검색합니다.',
      inputSchema: {
        query: z.string().describe('검색어 (예: 삼각김밥, 콜라, 도시락)'),
        page: z.number().optional().default(1).describe('페이지 번호 (기본값: 1)'),
        size: z.number().optional().default(20).describe('페이지당 결과 수 (기본값: 20)'),
        sort: z
          .enum(['recommend', 'recent', 'popular'])
          .optional()
          .default('recommend')
          .describe('정렬 기준 (기본값: recommend)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: searchProducts as (args: unknown) => Promise<McpToolResponse>,
  };
}
