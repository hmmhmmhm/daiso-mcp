/**
 * 가격 정보 조회 도구
 *
 * 다이소몰 API를 사용하여 상품의 가격 정보를 조회합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import type { ProductSearchResponse, ProductDoc } from '../types.js';
import { DAISOMALL_API, getImageUrl } from '../api.js';
import { fetchDaisoJson } from '../client.js';

/** 도구 입력 인터페이스 */
interface GetPriceInfoArgs {
  productId?: string;
  productName?: string;
}

/**
 * 상품 ID로 검색
 */
export async function fetchProductById(productId: string): Promise<ProductDoc | null> {
  const url = new URL(DAISOMALL_API.SEARCH_PRODUCTS);
  url.searchParams.set('searchTerm', productId);
  url.searchParams.set('cntPerPage', '10');
  url.searchParams.set('pageNum', '1');

  const data = await fetchDaisoJson<ProductSearchResponse>(url.toString());

  if (!data.resultSet?.result?.[0]?.resultDocuments) {
    return null;
  }

  const docs = data.resultSet.result[0].resultDocuments as unknown as ProductDoc[];
  // 정확한 ID 매칭 시도
  const exactMatch = docs.find((doc) => doc.PD_NO === productId);

  if (exactMatch) {
    return exactMatch;
  }

  return docs.length > 0 ? docs[0] : null;
}

/**
 * 상품명으로 검색
 */
async function fetchProductByName(productName: string): Promise<ProductDoc | null> {
  const url = new URL(DAISOMALL_API.SEARCH_PRODUCTS);
  url.searchParams.set('searchTerm', productName);
  url.searchParams.set('cntPerPage', '1');
  url.searchParams.set('pageNum', '1');

  const data = await fetchDaisoJson<ProductSearchResponse>(url.toString());

  if (!data.resultSet?.result?.[0]?.resultDocuments?.length) {
    return null;
  }

  return data.resultSet.result[0].resultDocuments[0] as unknown as ProductDoc;
}

/**
 * 가격 정보 조회 핸들러
 */
async function getPriceInfo(args: GetPriceInfoArgs): Promise<McpToolResponse> {
  const { productId, productName } = args;

  if (!productId && !productName) {
    throw new Error('상품 ID(productId) 또는 상품명(productName)을 입력해주세요.');
  }

  let product: ProductDoc | null = null;

  // productId가 있으면 ID로 검색, 없으면 productName으로 검색
  // 위에서 둘 다 없는 경우는 이미 에러 처리됨
  product = productId
    ? await fetchProductById(productId)
    : await fetchProductByName(productName!);

  if (!product) {
    throw new Error(`상품을 찾을 수 없습니다: ${productId || productName}`);
  }

  const price = parseInt(product.PD_PRC) || 0;

  const result = {
    productId: product.PD_NO,
    productName: product.PDNM || product.EXH_PD_NM,
    currentPrice: price,
    currency: 'KRW',
    imageUrl: getImageUrl(product.ATCH_FILE_URL),
    brand: product.BRND_NM || undefined,
    soldOut: product.SOLD_OUT_YN === 'Y',
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * 도구 등록 정보 생성
 */
export function createGetPriceInfoTool(): ToolRegistration {
  return {
    name: 'daiso_get_price_info',
    metadata: {
      title: '가격 정보',
      description: '제품의 가격 정보를 조회합니다. 제품 ID 또는 제품명으로 조회할 수 있습니다.',
      inputSchema: {
        productId: z.string().optional().describe('제품 ID'),
        productName: z.string().optional().describe('제품명 (productId가 없을 경우 사용)'),
      },
    },
    handler: getPriceInfo as (args: unknown) => Promise<McpToolResponse>,
  };
}
