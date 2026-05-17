/**
 * 세븐일레븐 상품 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { searchSevenElevenProductsWithVariants } from '../productKeyword.js';

interface SearchProductsArgs {
  query: string;
  page?: number;
  size?: number;
  sort?: 'recommend' | 'recent' | 'popular';
  timeoutMs?: number;
}

function buildTextResponse(payload: Record<string, unknown>): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const { query, page = 1, size = 20, sort = 'recommend', timeoutMs = 15000 } = args;

  if (!query || query.trim().length === 0) {
    throw new Error('상품 검색어(query)를 입력해주세요.');
  }

  const result = await searchSevenElevenProductsWithVariants(query, {
    page,
    size,
    sort,
    timeout: timeoutMs,
  });

  return buildTextResponse({
    query: result.query,
    page,
    size,
    sort,
    totalCount: result.totalCount,
    count: result.products.length,
    collectionIds: result.collectionIds,
    appliedQueries: result.appliedQueries,
    products: result.products,
  });
}

const searchProductsOutputSchema = {
  query: z.string().describe('적용된 검색어'),
  page: z.number().describe('페이지 번호'),
  size: z.number().describe('페이지 크기'),
  sort: z.string().describe('정렬 기준'),
  totalCount: z.number().describe('검색된 전체 상품 수'),
  count: z.number().describe('반환된 상품 수'),
  collectionIds: z.array(z.string()).describe('검색 컬렉션 ID 목록'),
  appliedQueries: z.array(z.string()).describe('실제로 시도한 검색어 목록'),
  products: z.array(z.unknown()).describe('세븐일레븐 상품 검색 결과'),
};

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
      outputSchema: searchProductsOutputSchema,
    },
    handler: searchProducts as (args: unknown) => Promise<McpToolResponse>,
  };
}
