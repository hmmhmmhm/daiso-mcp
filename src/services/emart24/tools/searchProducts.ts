/**
 * 이마트24 상품 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { searchEmart24Products } from '../client.js';

interface SearchProductsArgs {
  keyword: string;
  page?: number;
  pageSize?: number;
  sortType?: 'SALE' | 'LATEST' | 'PRICE_ASC' | 'PRICE_DESC';
  saleProductYn?: 'Y' | 'N';
  timeoutMs?: number;
}

function buildTextResponse(payload: Record<string, unknown>): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const {
    keyword,
    page = 1,
    pageSize = 10,
    sortType = 'SALE',
    saleProductYn = 'N',
    timeoutMs = 15000,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const result = await searchEmart24Products(
    {
      keyword,
      page,
      pageSize,
      sortType,
      saleProductYn,
    },
    {
      timeout: timeoutMs,
    },
  );

  return buildTextResponse({
    keyword,
    page,
    pageSize,
    sortType,
    saleProductYn,
    totalCount: result.totalCount,
    count: result.products.length,
    products: result.products,
  });
}

const searchProductsOutputSchema = {
  keyword: z.string().describe('검색어'),
  page: z.number().describe('조회 페이지'),
  pageSize: z.number().describe('페이지당 결과 수'),
  sortType: z.string().describe('정렬 기준'),
  saleProductYn: z.string().describe('행사 상품 여부 필터'),
  totalCount: z.number().describe('검색된 전체 상품 수'),
  count: z.number().describe('반환된 상품 수'),
  products: z.array(z.unknown()).describe('이마트24 상품 검색 결과'),
};

export function createSearchProductsTool(): ToolRegistration {
  return {
    name: 'emart24_search_products',
    metadata: {
      title: '이마트24 상품 검색',
      description: '키워드로 이마트24 상품 목록을 조회합니다.',
      inputSchema: {
        keyword: z.string().describe('상품 검색어 (예: 두바이, 도시락, 음료)'),
        page: z.number().optional().default(1).describe('조회 페이지 (기본값: 1)'),
        pageSize: z.number().optional().default(10).describe('페이지당 결과 수 (기본값: 10)'),
        sortType: z
          .enum(['SALE', 'LATEST', 'PRICE_ASC', 'PRICE_DESC'])
          .optional()
          .default('SALE')
          .describe('정렬 기준 (기본값: SALE)'),
        saleProductYn: z
          .enum(['Y', 'N'])
          .optional()
          .default('N')
          .describe('행사 상품 여부 필터 (기본값: N)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
      outputSchema: searchProductsOutputSchema,
    },
    handler: searchProducts as (args: unknown) => Promise<McpToolResponse>,
  };
}
