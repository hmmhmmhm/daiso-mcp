/**
 * 제품 검색 도구
 *
 * 다이소몰 API를 사용하여 제품을 검색합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import type { Product, ProductSearchResponse } from '../types.js';
import { DAISOMALL_API, getImageUrl } from '../api.js';
import { fetchDaisoJson } from '../client.js';

/** 도구 입력 인터페이스 */
interface SearchProductsArgs {
  query: string;
  page?: number;
  pageSize?: number;
}

/**
 * 다이소몰 API에서 상품 검색
 */
export async function fetchProducts(
  query: string,
  page: number = 1,
  pageSize: number = 30
): Promise<{ products: Product[]; totalCount: number }> {
  const url = new URL(DAISOMALL_API.SEARCH_PRODUCTS);
  url.searchParams.set('searchTerm', query);
  url.searchParams.set('cntPerPage', pageSize.toString());
  url.searchParams.set('pageNum', page.toString());

  const data = await fetchDaisoJson<ProductSearchResponse>(url.toString());

  // 결과가 없는 경우
  if (!data.resultSet?.result?.[0]?.resultDocuments) {
    return { products: [], totalCount: 0 };
  }

  const result = data.resultSet.result[0];
  const totalCount = result.totalSize || 0;

  const products: Product[] = result.resultDocuments.map((doc) => ({
    id: doc.PD_NO,
    name: doc.PDNM || doc.EXH_PD_NM || '',
    price: parseInt(doc.PD_PRC) || 0,
    imageUrl: getImageUrl(doc.ATCH_FILE_URL),
    brand: doc.BRND_NM || undefined,
    soldOut: doc.SOLD_OUT_YN === 'Y',
    isNew: doc.NEW_PD_YN === 'Y',
    pickupAvailable: doc.PKUP_OR_PSBL_YN === 'Y',
  }));

  return { products, totalCount };
}

/**
 * 제품 검색 핸들러
 */
async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
  const { query, page = 1, pageSize = 30 } = args;

  if (!query || query.trim().length === 0) {
    throw new Error('검색어를 입력해주세요.');
  }

  const { products, totalCount } = await fetchProducts(query, page, pageSize);

  const result = {
    query,
    page,
    pageSize,
    totalCount,
    count: products.length,
    products,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * 도구 등록 정보 생성
 */
export function createSearchProductsTool(): ToolRegistration {
  return {
    name: 'daiso_search_products',
    metadata: {
      title: '제품 검색',
      description: '다이소 제품을 검색합니다. 키워드로 제품을 검색할 수 있습니다.',
      inputSchema: {
        query: z.string().describe('검색할 제품명 또는 키워드'),
        page: z.number().optional().default(1).describe('페이지 번호 (기본값: 1)'),
        pageSize: z.number().optional().default(30).describe('페이지당 결과 수 (기본값: 30)'),
      },
    },
    handler: searchProducts as (args: unknown) => Promise<McpToolResponse>,
  };
}
