/**
 * 세븐일레븐 재고 확인 도구
 *
 * 상품 검색 + 매장 검색을 결합하여 특정 지역 매장의 재고를 조회합니다.
 * 재고 API가 암호화로 차단된 경우에도 상품/매장 정보를 함께 제공합니다.
 */
/* c8 ignore start */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { checkSevenElevenInventory } from '../inventory.js';

interface CheckInventoryArgs {
  keyword: string;
  storeKeyword?: string;
  storeLimit?: number;
  timeoutMs?: number;
}

function isEncryptedStockFailure(
  stockError: {
    code: number | null;
    message: string;
    raw: string | null;
  } | null,
): boolean {
  if (!stockError) {
    return false;
  }

  const codeMatched = stockError.code === 501 || stockError.code === 503;
  const messageSource = `${stockError.message} ${stockError.raw ?? ''}`;
  const messageMatched = /RSA|복호화|암호화|서비스를 사용할 수 없습니다/i.test(messageSource);
  return codeMatched || messageMatched;
}

async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    keyword,
    storeKeyword = '',
    storeLimit = 20,
    timeoutMs = 20000,
  } = args;

  if (!keyword || keyword.trim().length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const result = await checkSevenElevenInventory(
    {
      productKeyword: keyword,
      storeKeyword,
      storeLimit,
    },
    {
      timeout: timeoutMs,
    },
  );

  const note = result.stockAvailable
    ? '실시간 재고 데이터가 포함되어 있습니다.'
    : isEncryptedStockFailure(result.stockError)
      ? '실시간 재고 API가 암호화 검증에서 거절되었습니다. 현재 구현의 평문 요청만으로는 재고 수량을 조회할 수 없습니다.'
      : result.stockError
        ? `실시간 재고 API 호출에 실패했습니다: ${result.stockError.message}`
        : '실시간 재고 API가 현재 제한되어 있어 매장 목록만 제공됩니다. stockQuantity가 -1인 경우 재고 수량 미확인 상태입니다.';

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            keyword,
            storeKeyword,
            product: result.product,
            stockAvailable: result.stockAvailable,
            stockError: result.stockError,
            note,
            inventory: {
              totalStoreCount: result.totalStoreCount,
              inStockStoreCount: result.inStockStoreCount,
              count: result.stores.length,
              stores: result.stores,
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createCheckInventoryTool(): ToolRegistration {
  return {
    name: 'seveneleven_check_inventory',
    metadata: {
      title: '세븐일레븐 재고 확인',
      description:
        '상품 키워드와 매장/지역 키워드로 세븐일레븐 매장별 재고를 조회합니다. 실시간 재고 API가 제한된 경우에도 상품 정보와 근처 매장 목록을 함께 제공합니다.',
      inputSchema: {
        keyword: z.string().describe('상품 검색어 (예: 핫식스, 삼각김밥, 도시락)'),
        storeKeyword: z
          .string()
          .optional()
          .default('')
          .describe('매장/지역 검색 키워드 (예: 안산 중앙역, 강남역, 홍대)'),
        storeLimit: z.number().optional().default(20).describe('반환할 최대 매장 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(20000).describe('요청 제한 시간(ms, 기본값: 20000)'),
      },
    },
    handler: checkInventory as (args: unknown) => Promise<McpToolResponse>,
  };
}
/* c8 ignore stop */
