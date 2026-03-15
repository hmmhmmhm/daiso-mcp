/**
 * 올리브영 상품 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchOliveyoungProducts } from '../client.js';

interface SearchProductsArgs {
  keyword: string;
  page?: number;
  size?: number;
  sort?: string;
  includeSoldOut?: boolean;
  timeoutMs?: number;
  zyteApiKey?: string;
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const {
    keyword,
    page = 1,
    size = 20,
    sort = '01',
    includeSoldOut = false,
    timeoutMs = 15000,
    zyteApiKey,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const result = await fetchOliveyoungProducts(
    {
      keyword,
      page,
      size,
      sort,
      includeSoldOut,
    },
    {
      timeout: timeoutMs,
      apiKey: zyteApiKey,
    },
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            keyword,
            page,
            size,
            sort,
            includeSoldOut,
            totalCount: result.totalCount,
            nextPage: result.nextPage,
            count: result.products.length,
            products: result.products,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createSearchProductsTool(apiKey?: string): ToolRegistration {
  return {
    name: 'oliveyoung_search_products',
    metadata: {
      title: '올리브영 상품 검색',
      description:
        '키워드로 올리브영 상품 목록을 조회합니다. "어떤 거 있나요" 같은 질문에는 먼저 이 도구를 사용하세요.',
      inputSchema: {
        keyword: z.string().describe('상품 검색어 (예: 마스크팩, 선크림, 립밤)'),
        page: z.number().optional().default(1).describe('상품 검색 페이지 번호 (기본값: 1)'),
        size: z.number().optional().default(20).describe('페이지당 상품 수 (기본값: 20)'),
        sort: z.string().optional().default('01').describe('정렬 코드 (기본값: 01)'),
        includeSoldOut: z.boolean().optional().default(false).describe('품절 상품 포함 여부 (기본값: false)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args: SearchProductsArgs) =>
      searchProducts({ ...args, zyteApiKey: apiKey })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
