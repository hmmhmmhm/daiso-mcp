/**
 * GS25 상품 키워드 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { extractGs25ProductCandidates, fetchGs25Stores } from '../client.js';

interface SearchProductsArgs {
  keyword: string;
  serviceCode?: string;
  limit?: number;
  timeoutMs?: number;
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const {
    keyword,
    serviceCode = '01',
    limit = 20,
    timeoutMs = 20000,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const result = await fetchGs25Stores(
    {
      serviceCode,
      keyword,
      useCache: false,
    },
    {
      timeout: timeoutMs,
    },
  );

  const products = extractGs25ProductCandidates(result.stores).slice(0, limit);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            serviceCode,
            keyword,
            totalStoreCount: result.totalCount,
            count: products.length,
            products,
            note:
              products.length === 0
                ? '응답 내 상품 메타데이터가 없어 후보가 비어 있습니다. 키워드/시점에 따라 결과가 달라질 수 있습니다.'
                : null,
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
    name: 'gs25_search_products',
    metadata: {
      title: 'GS25 상품 키워드 검색',
      description: '키워드 기반으로 GS25 재고 응답에서 상품 후보를 추출합니다.',
      inputSchema: {
        keyword: z.string().describe('상품 검색어 (예: 오감자, 삼각김밥, 커피)'),
        serviceCode: z.string().optional().default('01').describe('서비스 코드 (기본값: 01=GS25)'),
        limit: z.number().optional().default(20).describe('반환할 최대 상품 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(20000).describe('요청 제한 시간(ms, 기본값: 20000)'),
      },
    },
    handler: searchProducts as (args: unknown) => Promise<McpToolResponse>,
  };
}
