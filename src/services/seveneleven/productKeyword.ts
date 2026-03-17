/**
 * 세븐일레븐 상품 검색어 보정
 */

import { searchSevenElevenProducts } from './client.js';
import type { SevenElevenProduct, SevenElevenSearchResult } from './types.js';

interface SearchVariantOptions {
  page?: number;
  size?: number;
  sort?: string;
  timeout?: number;
}

const SANDWICH_SUFFIX_FAMILY = ['샌드위치', '샌드', '산도'] as const;

function normalizeProductText(value: string): string {
  return value.replace(/[^0-9A-Za-z가-힣]+/g, '').toLowerCase();
}

function removeSuffixFamily(value: string): string {
  for (const suffix of SANDWICH_SUFFIX_FAMILY) {
    if (value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }

  return value;
}

/**
 * 세븐일레븐 상품 검색용 보정 질의를 생성합니다.
 */
export function buildSevenElevenProductKeywordVariants(rawKeyword: string): string[] {
  const base = rawKeyword.trim();
  if (!base) {
    return [];
  }

  const compact = base.replace(/\s+/g, '');
  const stem = removeSuffixFamily(compact);
  const candidates = [base, compact];

  if (stem && stem !== compact) {
    candidates.push(stem);
    for (const suffix of SANDWICH_SUFFIX_FAMILY) {
      candidates.push(`${stem}${suffix}`);
    }
    candidates.push('샌드');
  }

  return [...new Set(candidates.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/**
 * 원본 검색어 기준으로 가장 그럴듯한 상품을 고릅니다.
 */
export function pickBestSevenElevenProduct(
  products: SevenElevenProduct[],
  rawKeyword: string,
): SevenElevenProduct | null {
  let bestProduct: SevenElevenProduct | null = null;
  let bestScore = -1;

  for (const product of products) {
    const score = scoreSevenElevenProduct(product, rawKeyword);
    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  return bestScore > 0 ? bestProduct : null;
}

function scoreSevenElevenProduct(product: SevenElevenProduct, rawKeyword: string): number {
  const original = normalizeProductText(rawKeyword);
  const stem = normalizeProductText(removeSuffixFamily(rawKeyword.replace(/\s+/g, '')));
  const variants = buildSevenElevenProductKeywordVariants(rawKeyword)
    .map(normalizeProductText)
    .filter((value) => value.length > 0);
  const hasSandwichSuffix = stem.length > 0 && stem !== original;

  const normalizedName = normalizeProductText(product.itemName);
  if (normalizedName.length === 0) {
    return -1;
  }

  let score = 0;

  if (original.length > 0 && normalizedName === original) {
    score += 200;
  }

  if (original.length > 0 && normalizedName.includes(original)) {
    score += 120;
  }

  if (stem.length > 0 && stem !== original && normalizedName.includes(stem)) {
    score += 45;
  }

  for (const variant of variants) {
    if (variant.length < 2 || variant === original || variant === stem) {
      continue;
    }
    if (normalizedName.includes(variant)) {
      score += 15;
    }
  }

  if (hasSandwichSuffix && SANDWICH_SUFFIX_FAMILY.some((suffix) => normalizedName.includes(suffix))) {
    score += 35;
  }

  if (
    hasSandwichSuffix &&
    stem.length > 0 &&
    SANDWICH_SUFFIX_FAMILY.some((suffix) => normalizedName.includes(`${stem}${suffix}`))
  ) {
    score += 50;
  }

  if (product.itemCode.length > 0) {
    score += 1;
  }

  return score;
}

/**
 * 보정 질의를 순차 적용해 세븐일레븐 상품을 찾습니다.
 */
export async function searchSevenElevenProductsWithVariants(
  query: string,
  options: SearchVariantOptions = {},
): Promise<SevenElevenSearchResult & { appliedQueries: string[] }> {
  const { page = 1, size = 20, sort = 'recommend', timeout } = options;
  const appliedQueries = buildSevenElevenProductKeywordVariants(query);
  const seenKeys = new Set<string>();
  const collectionIds = new Set<string>();
  const mergedProducts: SevenElevenProduct[] = [];

  for (const candidate of appliedQueries) {
    const result = await searchSevenElevenProducts(
      {
        query: candidate,
        page,
        size,
        sort,
      },
      {
        timeout,
      },
    );

    for (const collectionId of result.collectionIds) {
      collectionIds.add(collectionId);
    }

    for (const product of result.products) {
      const key = product.itemCode || product.productNo || product.itemName;
      if (!key || seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      mergedProducts.push(product);
    }
  }

  const rankedProducts = [...mergedProducts].sort((left, right) => {
    const leftScore = scoreSevenElevenProduct(left, query);
    const rightScore = scoreSevenElevenProduct(right, query);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return 0;
  });

  const start = Math.max(page - 1, 0) * size;
  const pagedProducts = rankedProducts.slice(start, start + size);

  return {
    query,
    totalCount: rankedProducts.length,
    products: pagedProducts,
    collectionIds: [...collectionIds],
    appliedQueries,
  };
}
