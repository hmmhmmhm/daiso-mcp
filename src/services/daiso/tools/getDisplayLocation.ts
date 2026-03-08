/**
 * 진열 위치 조회 도구
 *
 * 다이소몰 API를 사용하여 매장 내 상품 진열 위치(구역/층)를 조회합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import type { DisplayLocation, DisplayLocationResponse } from '../types.js';
import { DAISOMALL_API } from '../api.js';
import { fetchDaisoJson } from '../client.js';

/** 도구 입력 인터페이스 */
interface GetDisplayLocationArgs {
  productId: string;
  storeCode: string;
}

/** 진열 위치 조회 결과 */
export interface DisplayLocationResult {
  productId: string;
  storeCode: string;
  hasLocation: boolean;
  locations: DisplayLocation[];
  message?: string | null;
}

/**
 * 매장 내 상품 진열 위치 조회
 */
export async function fetchDisplayLocation(
  productId: string,
  storeCode: string,
): Promise<DisplayLocationResult> {
  const data = await fetchDaisoJson<DisplayLocationResponse>(DAISOMALL_API.DISPLAY_LOCATION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdNo: productId, strCd: storeCode }),
  });

  if (!data.success) {
    return {
      productId,
      storeCode,
      hasLocation: false,
      locations: [],
      message: data.message ?? null,
    };
  }

  const locations: DisplayLocation[] = Array.isArray(data.data)
    ? data.data.map((item) => ({
        zoneNo: String(item.zoneNo ?? ''),
        stairNo: String(item.stairNo ?? ''),
        storeErp: String(item.storeErp ?? storeCode),
      }))
    : [];

  return {
    productId,
    storeCode,
    hasLocation: locations.length > 0,
    locations,
  };
}

/**
 * 진열 위치 조회 핸들러
 */
async function getDisplayLocation(args: GetDisplayLocationArgs): Promise<McpToolResponse> {
  const { productId, storeCode } = args;

  if (!productId || productId.trim().length === 0) {
    throw new Error('상품 ID(productId)를 입력해주세요.');
  }

  if (!storeCode || storeCode.trim().length === 0) {
    throw new Error('매장 코드(storeCode)를 입력해주세요.');
  }

  const result = await fetchDisplayLocation(productId, storeCode);

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * 도구 등록 정보 생성
 */
export function createGetDisplayLocationTool(): ToolRegistration {
  return {
    name: 'daiso_get_display_location',
    metadata: {
      title: '진열 위치 조회',
      description:
        '다이소 매장 내 상품의 진열 위치(구역/층)를 조회합니다. 상품 ID와 매장 코드가 필요합니다.',
      inputSchema: {
        productId: z.string().describe('상품 ID (daiso_search_products로 조회한 상품의 id)'),
        storeCode: z
          .string()
          .describe('매장 코드 (daiso_check_inventory로 조회한 매장의 storeCode)'),
      },
    },
    handler: getDisplayLocation as (args: unknown) => Promise<McpToolResponse>,
  };
}
