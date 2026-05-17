/**
 * GS25 상품 키워드 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchGs25SearchProducts } from '../client.js';

interface SearchProductsArgs {
  keyword: string;
  limit?: number;
  timeoutMs?: number;
}

function buildTextResponse(payload: Record<string, unknown>): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const { keyword, limit = 20, timeoutMs = 20000 } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const products = await fetchGs25SearchProducts(keyword, { timeout: timeoutMs });
  const limitedProducts = products.slice(0, limit);
  const payload = {
    keyword,
    count: limitedProducts.length,
    products: limitedProducts.map((p) => ({
      itemCode: p.itemCode,
      itemName: p.itemName,
      shortItemName: p.shortItemName,
      imageUrl: p.imageUrl,
      rating: p.rating,
      stockCheckEnabled: p.stockCheckEnabled,
    })),
    note:
      limitedProducts.length === 0
        ? '검색 결과가 없습니다. 다른 키워드로 검색해보세요.'
        : '재고 확인 시 itemCode를 gs25_check_inventory에 전달하면 정확한 상품 재고를 조회할 수 있습니다.',
  };

  return buildTextResponse(payload);
}

const searchProductsOutputSchema = {
  keyword: z.string().describe('검색어'),
  count: z.number().describe('반환된 상품 수'),
  products: z.array(z.unknown()).describe('GS25 상품 검색 결과'),
  note: z.string().describe('후속 재고 조회 안내'),
};

export function createSearchProductsTool(): ToolRegistration {
  return {
    name: 'gs25_search_products',
    metadata: {
      title: 'GS25 상품 키워드 검색',
      description:
        '키워드로 GS25 상품을 검색하여 itemCode를 조회합니다. 재고 확인 전에 먼저 이 도구로 정확한 상품을 찾으세요.',
      inputSchema: {
        keyword: z.string().describe('상품 검색어 (예: 핫식스, 삼각김밥, 커피)'),
        limit: z.number().optional().default(20).describe('반환할 최대 상품 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(20000).describe('요청 제한 시간(ms, 기본값: 20000)'),
      },
      outputSchema: searchProductsOutputSchema,
    },
    handler: searchProducts as (args: unknown) => Promise<McpToolResponse>,
  };
}
