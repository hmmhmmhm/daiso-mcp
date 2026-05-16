/**
 * 롯데마트 제타 상품 검색 fallback
 */

import { fetchJson } from '../../utils/http.js';
import { dedupeProducts } from './parser.js';
import { normalizeArea } from './storeSearch.js';
import type { SearchLotteMartProductsParams } from './clientTypes.js';
import type { LotteMartMarketOption, LotteMartProduct } from './types.js';

interface ZettaProductPageResponse {
  productGroups?: Array<{
    decoratedProducts?: ZettaProduct[];
  }>;
  metadata?: {
    nextPageToken?: string;
  };
}

interface ZettaProduct {
  retailerProductId?: string;
  name?: string;
  brand?: string;
  packSizeDescription?: string;
  price?: {
    amount?: string;
  };
  available?: boolean;
}

const ZETTA_PRODUCT_SEARCH_URL = 'https://lottemartzetta.com/api/webproductpagews/v6/product-pages/search';

function toZettaProductPrice(product: ZettaProduct): number {
  const parsed = Number.parseFloat(product.price?.amount || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function toZettaProductBarcode(retailerProductId: string | undefined): string {
  return (retailerProductId || '').replace(/^OS/i, '').trim();
}

function mapZettaProduct(
  area: string,
  storeCode: string,
  storeName: string,
  keyword: string,
  product: ZettaProduct,
): LotteMartProduct | null {
  const productName = (product.name || '').trim();
  if (productName.length === 0) {
    return null;
  }

  return {
    area,
    storeCode,
    storeName,
    keyword,
    productName,
    barcode: toZettaProductBarcode(product.retailerProductId),
    spec: (product.packSizeDescription || '').trim(),
    manufacturer: (product.brand || '').trim(),
    price: toZettaProductPrice(product),
    stockQuantity: product.available === false ? 0 : 1,
  };
}

function createZettaProductSearchUrl(keyword: string, pageToken?: string): string {
  const endpoint = new URL(ZETTA_PRODUCT_SEARCH_URL);
  endpoint.searchParams.set('q', keyword);
  endpoint.searchParams.set('tag', 'web');
  endpoint.searchParams.set('includeAdditionalPageInfo', pageToken ? 'false' : 'true');
  endpoint.searchParams.set('maxProductsToDecorate', '50');
  endpoint.searchParams.set('maxPageSize', '50');
  if (pageToken) {
    endpoint.searchParams.set('pageToken', pageToken);
  }
  return endpoint.toString();
}

export function createZettaFallbackStore(params: SearchLotteMartProductsParams): LotteMartMarketOption {
  const storeCode = (params.storeCode || '').trim();
  const storeName = (params.storeName || '').trim();

  return {
    area: normalizeArea(params.area || '') || '서울',
    storeCode: storeCode || 'zetta',
    storeName: storeName || `롯데마트 ${storeCode}`,
    brandVariant: 'lottemart',
  };
}

export async function fetchZettaLotteMartProductsWithPrimaryError(
  resolvedStore: LotteMartMarketOption,
  keyword: string,
  pageLimit: number,
  timeout: number,
  error: unknown,
) {
  try {
    return await fetchZettaLotteMartProducts(resolvedStore, keyword, pageLimit, timeout);
  } catch (fallbackError) {
    const primaryMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : '알 수 없는 오류가 발생했습니다.';
    throw new Error(`롯데마트 상품 조회 실패: 기존 경로(${primaryMessage}), 제타 경로(${fallbackMessage})`);
  }
}

function clampZettaPageLimit(pageLimit: number): number {
  if (pageLimit < 1) {
    return 1;
  }
  if (pageLimit > 5) {
    return 5;
  }
  return pageLimit;
}

async function fetchZettaLotteMartProducts(
  resolvedStore: LotteMartMarketOption,
  keyword: string,
  pageLimit: number,
  timeout: number,
): Promise<{
  area: string;
  storeCode: string;
  storeName: string;
  totalCount: number;
  totalPages: number;
  products: LotteMartProduct[];
}> {
  const products: LotteMartProduct[] = [];
  let nextPageToken: string | undefined;
  let fetchedPages = 0;
  const maxPage = clampZettaPageLimit(pageLimit);

  do {
    const response = await fetchJson<ZettaProductPageResponse>(createZettaProductSearchUrl(keyword, nextPageToken), {
      timeout,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Referer: `https://lottemartzetta.com/products/search?q=${encodeURIComponent(keyword)}`,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      },
    });

    fetchedPages += 1;
    products.push(
      ...(response.productGroups || [])
        .flatMap((group) => group.decoratedProducts || [])
        .map((product) =>
          mapZettaProduct(resolvedStore.area, resolvedStore.storeCode, resolvedStore.storeName, keyword, product),
        )
        .filter((product): product is LotteMartProduct => product !== null),
    );
    nextPageToken = response.metadata?.nextPageToken;
  } while (nextPageToken && fetchedPages < maxPage);

  const dedupedProducts = dedupeProducts(products);
  return {
    area: resolvedStore.area,
    storeCode: resolvedStore.storeCode,
    storeName: resolvedStore.storeName,
    totalCount: dedupedProducts.length,
    totalPages: nextPageToken ? fetchedPages + 1 : fetchedPages,
    products: dedupedProducts,
  };
}
