/**
 * 올리브영 재고 파악 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchOliveyoungProducts, fetchOliveyoungStores } from '../client.js';

interface CheckInventoryArgs {
  keyword: string;
  latitude?: number;
  longitude?: number;
  storeKeyword?: string;
  page?: number;
  size?: number;
  sort?: string;
  includeSoldOut?: boolean;
  storeLimit?: number;
  timeoutMs?: number;
  zyteApiKey?: string;
}

async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    keyword,
    latitude = 37.5665,
    longitude = 126.978,
    storeKeyword = '',
    page = 1,
    size = 20,
    sort = '01',
    includeSoldOut = false,
    storeLimit = 10,
    timeoutMs = 15000,
    zyteApiKey,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const [storeResult, productResult] = await Promise.all([
    fetchOliveyoungStores(
      {
        latitude,
        longitude,
        pageIdx: 1,
        searchWords: storeKeyword,
      },
      {
        timeout: timeoutMs,
        apiKey: zyteApiKey,
      }
    ),
    fetchOliveyoungProducts(
      {
        keyword,
        page,
        size,
        sort,
        includeSoldOut,
      },
      {
        timeout: timeoutMs,
        apiKey: zyteApiKey,
      }
    ),
  ]);

  const inStockProducts = productResult.products.filter(
    (product) => product.o2oStockFlag || product.o2oRemainQuantity > 0
  );

  const result = {
    keyword,
    searchOptions: {
      page,
      size,
      sort,
      includeSoldOut,
      storeKeyword,
    },
    location: {
      latitude,
      longitude,
    },
    nearbyStores: {
      totalCount: storeResult.totalCount,
      count: Math.min(storeLimit, storeResult.stores.length),
      stores: storeResult.stores.slice(0, storeLimit),
    },
    inventory: {
      totalCount: productResult.totalCount,
      nextPage: productResult.nextPage,
      inStockCount: inStockProducts.length,
      outOfStockCount: productResult.products.length - inStockProducts.length,
      products: productResult.products,
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createCheckInventoryTool(apiKey?: string): ToolRegistration {
  return {
    name: 'oliveyoung_check_inventory',
    metadata: {
      title: '올리브영 재고 파악',
      description:
        '상품 키워드로 올리브영 재고(품절 포함 여부 선택 가능)를 조회하고, 주변 매장 정보와 함께 반환합니다.',
      inputSchema: {
        keyword: z.string().describe('재고를 확인할 상품 키워드 (예: 선크림, 립밤, 샴푸)'),
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        storeKeyword: z
          .string()
          .optional()
          .describe('주변 매장 필터 키워드 (예: 명동, 강남). 비우면 주변 매장 전체'),
        page: z.number().optional().default(1).describe('상품 검색 페이지 번호 (기본값: 1)'),
        size: z.number().optional().default(20).describe('페이지당 상품 수 (기본값: 20)'),
        sort: z.string().optional().default('01').describe('정렬 코드 (기본값: 01)'),
        includeSoldOut: z.boolean().optional().default(false).describe('품절 상품 포함 여부 (기본값: false)'),
        storeLimit: z.number().optional().default(10).describe('반환할 주변 매장 최대 수 (기본값: 10)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args: CheckInventoryArgs) =>
      checkInventory({ ...args, zyteApiKey: apiKey })) as (args: unknown) => Promise<McpToolResponse>,
  };
}
