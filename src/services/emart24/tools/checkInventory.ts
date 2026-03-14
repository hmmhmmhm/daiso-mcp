/**
 * 이마트24 재고 확인 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { lookupEmart24Inventory } from '../inventoryLookup.js';

interface CheckInventoryArgs {
  pluCd?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  storeKeyword?: string;
  area1?: string;
  area2?: string;
  service24h?: boolean;
  productPage?: number;
  productPageSize?: number;
  storeLimit?: number;
  timeoutMs?: number;
}

async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    pluCd,
    keyword = '',
    latitude,
    longitude,
    storeKeyword = '',
    area1 = '',
    area2 = '',
    service24h = false,
    productPage = 1,
    productPageSize = 10,
    storeLimit = 10,
    timeoutMs = 15000,
  } = args;

  const result = await lookupEmart24Inventory({
    pluCd,
    keyword,
    latitude,
    longitude,
    storeKeyword,
    area1,
    area2,
    service24h,
    productPage,
    productPageSize,
    storeLimit,
    timeoutMs,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export function createCheckInventoryTool(): ToolRegistration {
  return {
    name: 'emart24_check_inventory',
    metadata: {
      title: '이마트24 재고 확인',
      description: 'PLU 코드 또는 상품 키워드로 매장별 재고 수량을 조회합니다.',
      inputSchema: {
        pluCd: z.string().optional().describe('상품 PLU 코드 (예: 8800244010504)'),
        keyword: z.string().optional().describe('상품 검색어 (pluCd 미입력 시 필수)'),
        latitude: z.number().optional().describe('위도 (선택)'),
        longitude: z.number().optional().describe('경도 (선택)'),
        storeKeyword: z.string().optional().describe('매장 키워드 필터 (예: 강남)'),
        area1: z.string().optional().describe('시/도 (예: 서울특별시)'),
        area2: z.string().optional().describe('구/군 (예: 강남구)'),
        service24h: z.boolean().optional().default(false).describe('24시간 매장만 대상으로 조회'),
        productPage: z.number().optional().default(1).describe('상품 검색 페이지 (기본값: 1)'),
        productPageSize: z.number().optional().default(10).describe('상품 검색 수 (기본값: 10)'),
        storeLimit: z.number().optional().default(10).describe('조회할 매장 수 (기본값: 10)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: checkInventory as (args: unknown) => Promise<McpToolResponse>,
  };
}
