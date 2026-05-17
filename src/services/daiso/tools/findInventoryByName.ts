/**
 * 상품명 기반 재고 통합 조회 도구
 *
 * 상품명과 위치만 아는 사용자를 위해 상품 검색과 재고 조회를 한 번에 수행합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import type { Product, ProductSummary } from '../types.js';
import { fetchProducts } from './searchProducts.js';
import { fetchOnlineStock, fetchStoreInventory } from './checkInventory.js';
import { fetchStores } from './findStores.js';

interface FindInventoryByNameArgs {
  query: string;
  storeQuery?: string;
  latitude?: number;
  longitude?: number;
  page?: number;
  pageSize?: number;
  productLimit?: number;
}

interface ResolvedLocation {
  latitude: number;
  longitude: number;
  source: 'input' | 'storeQuery' | 'default';
  storeName?: string;
  storeAddress?: string;
}

function buildTextResponse(payload: Record<string, unknown>): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function buildEmptySummary(query: string, storeQuery: string): Record<string, string> {
  return {
    headline: `"${query}" 상품 후보를 찾지 못했습니다.`,
    selectedProduct: '',
    storeQuery: storeQuery || '미지정',
    inventorySummary: '상품 후보가 없어 온라인/매장 재고 조회를 건너뛰었습니다.',
    displayLocationHint: '상품 후보를 먼저 확인한 뒤 daiso_get_display_location을 사용할 수 있습니다.',
  };
}

async function resolveInventoryLocation(args: {
  storeQuery: string;
  latitude?: number;
  longitude?: number;
}): Promise<ResolvedLocation> {
  if (typeof args.latitude === 'number' && typeof args.longitude === 'number') {
    return {
      latitude: args.latitude,
      longitude: args.longitude,
      source: 'input',
    };
  }

  if (args.storeQuery.trim().length > 0) {
    const stores = await fetchStores(args.storeQuery);
    const firstStore = stores[0];
    if (firstStore) {
      return {
        latitude: firstStore.lat,
        longitude: firstStore.lng,
        source: 'storeQuery',
        storeName: firstStore.name,
        storeAddress: firstStore.address,
      };
    }
  }

  return {
    latitude: args.latitude ?? 37.5665,
    longitude: args.longitude ?? 126.978,
    source: 'default',
  };
}

function buildInventorySummary(args: {
  query: string;
  storeQuery: string;
  selectedProductName: string;
  onlineStock: number;
  inStockCount: number;
  totalStores: number;
}): Record<string, string> {
  const storeScope = args.storeQuery || '기본 위치 주변';
  return {
    headline: `"${args.query}" 조회 결과, "${args.selectedProductName}" 상품을 기준으로 재고를 확인했습니다.`,
    selectedProduct: args.selectedProductName,
    storeQuery: args.storeQuery || '미지정',
    inventorySummary: `${storeScope} 매장 ${args.totalStores}곳 중 ${args.inStockCount}곳에서 재고가 확인되었습니다. 온라인 재고는 ${args.onlineStock}개입니다.`,
    displayLocationHint: '진열 위치가 필요하면 storeInventory.stores[].storeCode로 daiso_get_display_location을 호출하세요.',
  };
}

function toSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    brand: product.brand,
    soldOut: product.soldOut,
    isNew: product.isNew,
  };
}

function normalizeProductName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function scoreProductCandidate(query: string, candidate: ProductSummary, index: number): number {
  const normalizedQuery = normalizeProductName(query);
  const normalizedName = normalizeProductName(candidate.name);
  const exactMatchScore = normalizedName === normalizedQuery ? 100 : 0;
  const availabilityScore = candidate.soldOut ? 0 : 20;
  const startsWithScore = normalizedName.startsWith(normalizedQuery) ? 10 : 0;
  const containsScore = normalizedName.includes(normalizedQuery) ? 5 : 0;
  return exactMatchScore + availabilityScore + startsWithScore + containsScore - index / 1000;
}

function selectProductCandidate(query: string, candidates: ProductSummary[]): ProductSummary | null {
  return (
    candidates
      .map((candidate, index) => ({
        candidate,
        score: scoreProductCandidate(query, candidate, index),
      }))
      .sort((a, b) => b.score - a.score)[0]?.candidate ?? null
  );
}

async function findInventoryByName(args: FindInventoryByNameArgs): Promise<McpToolResponse> {
  const {
    query,
    storeQuery = '',
    latitude,
    longitude,
    page = 1,
    pageSize = 30,
    productLimit = 5,
  } = args;

  if (!query || query.trim().length === 0) {
    throw new Error('상품명(query)을 입력해주세요.');
  }

  const productResult = await fetchProducts(query, 1, productLimit);
  const productCandidates = productResult.products.map(toSummary);
  const selectedProduct = selectProductCandidate(query, productCandidates);

  if (!selectedProduct) {
    return buildTextResponse({
      query,
      storeQuery,
      summary: buildEmptySummary(query, storeQuery),
      productCandidates: [],
      selectedProduct: null,
      onlineStock: 0,
      storeInventory: {
        totalStores: 0,
        inStockCount: 0,
        outOfStockCount: 0,
        page,
        pageSize,
        stores: [],
      },
      nextSteps: {
        productSearchTool: 'daiso_search_products',
        inventoryTool: 'daiso_check_inventory',
        note: '상품 후보가 없어서 재고 조회를 진행하지 않았습니다.',
      },
    });
  }

  const resolvedLocation = await resolveInventoryLocation({
    storeQuery,
    latitude,
    longitude,
  });

  const [onlineStock, storeResult] = await Promise.all([
    fetchOnlineStock(selectedProduct.id),
    fetchStoreInventory(
      selectedProduct.id,
      resolvedLocation.latitude,
      resolvedLocation.longitude,
      page,
      pageSize,
      storeQuery,
    ),
  ]);
  const stores = storeResult.stores;
  const inStockCount = stores.filter((store) => store.quantity > 0).length;

  const result = {
    query,
    storeQuery,
    location: resolvedLocation,
    summary: buildInventorySummary({
      query,
      storeQuery,
      selectedProductName: selectedProduct.name,
      onlineStock,
      inStockCount,
      totalStores: storeResult.totalCount,
    }),
    productCandidates,
    selectedProduct,
    onlineStock,
    storeInventory: {
      totalStores: storeResult.totalCount,
      inStockCount,
      outOfStockCount: stores.filter((store) => store.quantity === 0).length,
      page,
      pageSize,
      stores,
    },
    nextSteps: {
      productSearchTool: 'daiso_search_products',
      inventoryTool: 'daiso_check_inventory',
      displayLocationTool: 'daiso_get_display_location',
      storeCodeSource: '진열 위치가 필요하면 storeInventory.stores[].storeCode를 사용하세요.',
    },
  };

  return buildTextResponse(result);
}

const inventoryByNameOutputSchema = {
  query: z.string().describe('사용자가 입력한 상품 검색어'),
  storeQuery: z.string().describe('사용자가 입력한 위치 키워드'),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      source: z.enum(['input', 'storeQuery', 'default']),
      storeName: z.string().optional(),
      storeAddress: z.string().optional(),
    })
    .optional()
    .describe('재고 조회에 사용한 위치와 위치 해석 출처'),
  summary: z
    .object({
      headline: z.string(),
      selectedProduct: z.string(),
      storeQuery: z.string(),
      inventorySummary: z.string(),
      displayLocationHint: z.string(),
    })
    .describe('사용자에게 바로 보여줄 요약'),
  productCandidates: z.array(z.unknown()).describe('검색된 상품 후보 목록'),
  selectedProduct: z.unknown().nullable().describe('재고 조회 기준으로 선택한 상품'),
  onlineStock: z.number().describe('온라인 재고 수량'),
  storeInventory: z
    .object({
      totalStores: z.number(),
      inStockCount: z.number(),
      outOfStockCount: z.number(),
      page: z.number(),
      pageSize: z.number(),
      stores: z.array(z.unknown()),
    })
    .describe('매장별 재고 조회 결과'),
  nextSteps: z.record(z.string(), z.unknown()).describe('후속 도구 호출 안내'),
};

export function createFindInventoryByNameTool(): ToolRegistration {
  return {
    name: 'daiso_find_inventory_by_name',
    metadata: {
      title: '상품명 기반 재고 통합 조회',
      description:
        '상품명과 대강의 위치만 아는 사용자를 위해 제품 검색부터 재고 조회까지 한 번에 수행합니다. 결과의 storeInventory.stores[].storeCode는 진열 위치 조회에 사용할 수 있습니다.',
      inputSchema: {
        query: z.string().describe('검색할 상품명 또는 키워드'),
        storeQuery: z.string().optional().describe('역명, 동네, 매장명 같은 대강의 위치'),
        latitude: z.number().optional().describe('위도 (생략 시 서울 시청 37.5665)'),
        longitude: z.number().optional().describe('경도 (생략 시 서울 시청 126.978)'),
        page: z.number().optional().default(1).describe('재고 매장 페이지 번호 (기본값: 1)'),
        pageSize: z.number().optional().default(30).describe('재고 매장 페이지 크기 (기본값: 30)'),
        productLimit: z.number().optional().default(5).describe('상품 후보 수 (기본값: 5)'),
      },
      outputSchema: inventoryByNameOutputSchema,
    },
    handler: findInventoryByName as (args: unknown) => Promise<McpToolResponse>,
  };
}
