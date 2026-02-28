/**
 * 제품 검색 도구
 *
 * 다이소몰 API를 사용하여 제품을 검색합니다.
 * API: https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods
 */

import type { Product, ProductSearchResponse, McpToolResponse } from '../types/index.js';
import { fetchJson } from '../utils/fetch.js';

interface SearchProductsArgs {
  query: string;
  page?: number;
  pageSize?: number;
}

// 이미지 URL 생성
function getImageUrl(path?: string): string | undefined {
  if (!path) return undefined;
  return `https://img.daisomall.co.kr${path}`;
}

// 다이소몰 API에서 상품 검색
async function fetchProducts(
  query: string,
  page: number = 1,
  pageSize: number = 30
): Promise<{ products: Product[]; totalCount: number }> {
  const url = new URL('https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods');
  url.searchParams.set('searchTerm', query);
  url.searchParams.set('cntPerPage', pageSize.toString());
  url.searchParams.set('pageNum', page.toString());

  const data = await fetchJson<ProductSearchResponse>(url.toString());

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

export async function searchProducts(args: SearchProductsArgs): Promise<McpToolResponse> {
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
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
