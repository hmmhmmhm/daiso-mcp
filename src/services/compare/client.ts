import { fetchProducts as fetchDaisoProducts } from '../daiso/tools/searchProducts.js';
import { fetchGs25SearchProducts } from '../gs25/client.js';
import { searchSevenElevenProducts } from '../seveneleven/client.js';
import { searchEmart24Products } from '../emart24/client.js';
import type { ComparableProduct, CompareProductsResult, CompareServiceId } from './types.js';

const DEFAULT_COMPARE_SERVICES: CompareServiceId[] = ['daiso', 'gs25', 'seveneleven', 'emart24'];

const SERVICE_NAMES: Record<CompareServiceId, string> = {
  daiso: '다이소',
  gs25: 'GS25',
  seveneleven: '세븐일레븐',
  emart24: '이마트24',
};

interface CompareProductsParams {
  keyword: string;
  limit?: number;
  services?: CompareServiceId[];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseServices(value: string | undefined): CompareServiceId[] {
  if (!value || value.trim().length === 0) {
    return DEFAULT_COMPARE_SERVICES;
  }

  const allowed = new Set<CompareServiceId>(DEFAULT_COMPARE_SERVICES);
  const services = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is CompareServiceId => allowed.has(item as CompareServiceId));

  return services.length > 0 ? [...new Set(services)] : DEFAULT_COMPARE_SERVICES;
}

function normalizePrice(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function sortComparableProducts(products: ComparableProduct[]): ComparableProduct[] {
  const serviceOrder = new Map(DEFAULT_COMPARE_SERVICES.map((service, index) => [service, index]));

  return [...products].sort((a, b) => {
    if (a.price !== null && b.price !== null && a.price !== b.price) {
      return a.price - b.price;
    }
    if (a.price !== null && b.price === null) {
      return -1;
    }
    if (a.price === null && b.price !== null) {
      return 1;
    }
    return serviceOrder.get(a.service)! - serviceOrder.get(b.service)!;
  });
}

async function searchService(
  service: CompareServiceId,
  keyword: string,
  limit: number,
): Promise<ComparableProduct[]> {
  if (service === 'daiso') {
    const result = await fetchDaisoProducts(keyword, 1, limit);
    return result.products.map((product) => ({
      service,
      serviceName: SERVICE_NAMES[service],
      code: product.id,
      name: product.name,
      price: normalizePrice(product.price),
      imageUrl: product.imageUrl,
      raw: product,
    }));
  }

  if (service === 'gs25') {
    const products = await fetchGs25SearchProducts(keyword, { timeout: 15000 });
    return products.slice(0, limit).map((product) => ({
      service,
      serviceName: SERVICE_NAMES[service],
      code: product.itemCode,
      name: product.itemName || product.shortItemName,
      price: null,
      imageUrl: product.imageUrl,
      stockCheckEnabled: product.stockCheckEnabled,
      raw: product,
    }));
  }

  if (service === 'seveneleven') {
    const result = await searchSevenElevenProducts({ query: keyword, page: 1, size: limit });
    return result.products.map((product) => ({
      service,
      serviceName: SERVICE_NAMES[service],
      code: product.itemCode || product.productNo,
      name: product.itemName,
      price: normalizePrice(product.salePrice),
      originalPrice: normalizePrice(product.originalPrice),
      imageUrl: product.imageUrl,
      raw: product,
    }));
  }

  const result = await searchEmart24Products({
    keyword,
    page: 1,
    pageSize: limit,
    sortType: 'PRICE_ASC',
    saleProductYn: 'N',
  });
  return result.products.map((product) => ({
    service,
    serviceName: SERVICE_NAMES[service],
    code: product.pluCd,
    name: product.goodsName,
    price: normalizePrice(product.viewPrice),
    originalPrice: normalizePrice(product.originPrice),
    raw: product,
  }));
}

export function parseCompareServices(value: string | undefined): CompareServiceId[] {
  return parseServices(value);
}

export async function compareProducts(
  params: CompareProductsParams,
): Promise<CompareProductsResult> {
  const keyword = params.keyword.trim();
  const limit = Math.max(1, Math.min(Math.trunc(params.limit || 5), 20));
  const services =
    params.services && params.services.length > 0 ? params.services : DEFAULT_COMPARE_SERVICES;

  const settled = await Promise.allSettled(
    services.map(async (service) => ({
      service,
      products: await searchService(service, keyword, limit),
    })),
  );

  const results: ComparableProduct[] = [];
  const errors: CompareProductsResult['errors'] = [];

  for (const item of settled) {
    if (item.status === 'fulfilled') {
      results.push(...item.value.products);
    } else {
      const service = services[settled.indexOf(item)] as CompareServiceId;
      errors.push({ service, message: toErrorMessage(item.reason) });
    }
  }

  const sorted = sortComparableProducts(results);
  return {
    keyword,
    services,
    serviceCount: services.length,
    resultCount: sorted.length,
    bestPrice: sorted.find((product) => product.price !== null) || null,
    results: sorted,
    errors,
    note: '새 외부 키 없이 기존 공개 상품 검색을 묶은 가격 후보입니다. 실제 재고와 행사가는 매장별로 달라질 수 있습니다.',
  };
}
