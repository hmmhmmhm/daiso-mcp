/**
 * 다이소 상품 매핑 유틸리티
 */

import { getImageUrl } from './api.js';
import type { ProductDoc, ProductSummary } from './types.js';

/**
 * 검색/상세 응답의 상품 문서를 공통 요약 형태로 변환합니다.
 */
export function toProductSummary(product: ProductDoc): ProductSummary {
  return {
    id: product.PD_NO,
    name: product.PDNM || product.EXH_PD_NM || '',
    imageUrl: getImageUrl(product.ATCH_FILE_URL),
    brand: product.BRND_NM || undefined,
    soldOut: product.SOLD_OUT_YN === 'Y',
    isNew: product.NEW_PD_YN === 'Y',
  };
}
