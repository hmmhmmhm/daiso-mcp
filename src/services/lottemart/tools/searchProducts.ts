/**
 * 롯데마트 상품 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { searchLotteMartProducts } from '../client.js';
import { DEFAULT_LOTTEMART_TIMEOUT_MS } from '../config.js';

interface SearchProductsArgs {
  area?: string;
  storeCode?: string;
  storeName?: string;
  keyword: string;
  pageLimit?: number;
  source?: 'auto' | 'legacy' | 'zetta';
  timeoutMs?: number;
  zyteApiKey?: string;
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const {
    area,
    storeCode,
    storeName,
    keyword,
    pageLimit = 3,
    source = 'auto',
    timeoutMs = DEFAULT_LOTTEMART_TIMEOUT_MS,
    zyteApiKey,
  } = args;

  const result = await searchLotteMartProducts(
    {
      area,
      storeCode,
      storeName,
      keyword,
      pageLimit,
      source,
    },
    {
      timeout: timeoutMs,
      zyteApiKey,
    },
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            area: result.area,
            storeCode: result.storeCode,
            storeName: result.storeName,
            keyword,
            pageLimit,
            source,
            totalCount: result.totalCount,
            totalPages: result.totalPages,
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

export function createSearchProductsTool(zyteApiKey?: string): ToolRegistration {
  return {
    name: 'lottemart_search_products',
    metadata: {
      title: '롯데마트 상품 검색',
      description: '특정 롯데마트 매장을 기준으로 상품 가격과 재고를 조회합니다.',
      inputSchema: {
        area: z.string().optional().describe('지역 (storeCode 미입력 시 storeName 해석에 사용)'),
        storeCode: z.string().optional().describe('매장 코드 (예: 2301)'),
        storeName: z.string().optional().describe('매장명 (예: 강변점)'),
        keyword: z.string().describe('상품 검색어 (예: 콜라, 우유, 과자)'),
        pageLimit: z.number().optional().default(3).describe('추가 조회할 최대 페이지 수 (기본값: 3)'),
        source: z
          .enum(['auto', 'legacy', 'zetta'])
          .optional()
          .default('auto')
          .describe('상품 검색 경로 (auto: 구형 경로 후 제타 대체, zetta: 빠른 제타 API 우선, legacy: 구형 경로만 사용)'),
        timeoutMs: z
          .number()
          .optional()
          .default(DEFAULT_LOTTEMART_TIMEOUT_MS)
          .describe(`요청 제한 시간(ms, 기본값: ${DEFAULT_LOTTEMART_TIMEOUT_MS})`),
      },
    },
    handler: ((args: SearchProductsArgs) =>
      searchProducts({
        ...args,
        zyteApiKey: args.zyteApiKey || zyteApiKey,
      })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
