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

interface FindInventoryByNameArgs {
  query: string;
  storeQuery?: string;
  latitude?: number;
  longitude?: number;
  page?: number;
  pageSize?: number;
  productLimit?: number;
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

async function findInventoryByName(args: FindInventoryByNameArgs): Promise<McpToolResponse> {
  const {
    query,
    storeQuery = '',
    latitude = 37.5665,
    longitude = 126.978,
    page = 1,
    pageSize = 30,
    productLimit = 5,
  } = args;

  if (!query || query.trim().length === 0) {
    throw new Error('상품명(query)을 입력해주세요.');
  }

  const productResult = await fetchProducts(query, 1, productLimit);
  const productCandidates = productResult.products.map(toSummary);
  const selectedProduct = productCandidates[0] ?? null;

  if (!selectedProduct) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              storeQuery,
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
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const [onlineStock, storeResult] = await Promise.all([
    fetchOnlineStock(selectedProduct.id),
    fetchStoreInventory(selectedProduct.id, latitude, longitude, page, pageSize, storeQuery),
  ]);
  const stores = storeResult.stores;

  const result = {
    query,
    storeQuery,
    location: { latitude, longitude },
    productCandidates,
    selectedProduct,
    onlineStock,
    storeInventory: {
      totalStores: storeResult.totalCount,
      inStockCount: stores.filter((store) => store.quantity > 0).length,
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

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

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
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        page: z.number().optional().default(1).describe('재고 매장 페이지 번호 (기본값: 1)'),
        pageSize: z.number().optional().default(30).describe('재고 매장 페이지 크기 (기본값: 30)'),
        productLimit: z.number().optional().default(5).describe('상품 후보 수 (기본값: 5)'),
      },
    },
    handler: findInventoryByName as (args: unknown) => Promise<McpToolResponse>,
  };
}
