/**
 * 가격 정보 조회 도구
 *
 * 다이소몰 API를 사용하여 상품의 가격 정보를 조회합니다.
 * 상품 검색 API를 통해 가격 정보를 가져옵니다.
 */

import type { ProductSearchResponse, McpToolResponse } from '../types/index.js';
import { fetchJson } from '../utils/fetch.js';

interface GetPriceInfoArgs {
  productId?: string;
  productName?: string;
}

interface ProductDoc {
  PD_NO: string;
  PDNM: string;
  EXH_PD_NM?: string;
  PD_PRC: string;
  ATCH_FILE_URL?: string;
  BRND_NM?: string;
  SOLD_OUT_YN?: string;
}

// 이미지 URL 생성
function getImageUrl(path?: string): string | undefined {
  if (!path) return undefined;
  return `https://img.daisomall.co.kr${path}`;
}

// 상품 ID로 검색
async function fetchProductById(productId: string): Promise<ProductDoc | null> {
  const url = new URL('https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods');
  url.searchParams.set('searchTerm', productId);
  url.searchParams.set('cntPerPage', '10');
  url.searchParams.set('pageNum', '1');

  const data = await fetchJson<ProductSearchResponse>(url.toString());

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

// 상품명으로 검색
async function fetchProductByName(productName: string): Promise<ProductDoc | null> {
  const url = new URL('https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods');
  url.searchParams.set('searchTerm', productName);
  url.searchParams.set('cntPerPage', '1');
  url.searchParams.set('pageNum', '1');

  const data = await fetchJson<ProductSearchResponse>(url.toString());

  if (!data.resultSet?.result?.[0]?.resultDocuments?.length) {
    return null;
  }

  return data.resultSet.result[0].resultDocuments[0] as unknown as ProductDoc;
}

export async function getPriceInfo(args: GetPriceInfoArgs): Promise<McpToolResponse> {
  const { productId, productName } = args;

  if (!productId && !productName) {
    throw new Error('상품 ID(productId) 또는 상품명(productName)을 입력해주세요.');
  }

  let product: ProductDoc | null = null;

  if (productId) {
    product = await fetchProductById(productId);
  } else if (productName) {
    product = await fetchProductByName(productName);
  }

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
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
