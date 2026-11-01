import type { OliveyoungRequestOptions } from '../transport.js';
/**
 * 올리브영 오특(오늘의 특가) 조회 도구
 *
 * 오늘의 브랜드 특가와 오늘의 특가 전체 목록을 한국 날짜 기준으로 반환합니다.
 * 공개 MCP에서는 get_catalog의 service=oliveyoung, operation=today_deals로 호출합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchOliveyoungTodayDeals } from '../todayDeals.js';

interface GetTodayDealsArgs {
  timeoutMs?: number;
}

async function getTodayDeals(
  args: GetTodayDealsArgs,
  transport: OliveyoungRequestOptions,
): Promise<McpToolResponse> {
  const { timeoutMs = transport.timeout ?? (transport.relayUrl ? 60000 : 15000) } = args;
  const result = await fetchOliveyoungTodayDeals({ ...transport, timeout: timeoutMs });
  const body = {
    date: result.date,
    brandDealCount: result.brandDeals.length,
    todayDealCount: result.todayDeals.length,
    truncated: result.truncated,
    brandDeals: result.brandDeals,
    todayDeals: result.todayDeals,
    note: '가격과 할인율은 조회 시점의 오특 화면 기준입니다. priceFrom=true는 옵션별 최저가, soldOut=true는 일시품절입니다. 매장 재고는 check_inventory(service=oliveyoung)에 상품명을 keyword로 조회하세요.',
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
  };
}

const dealSchema = z.object({
  rank: z.number(),
  goodsNo: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.string(),
  price: z.number(),
  priceFrom: z.boolean(),
  originalPrice: z.number().nullable(),
  discountRate: z.number().nullable(),
  flags: z.array(z.string()),
  todayDelivery: z.boolean(),
  soldOut: z.boolean(),
  imageUrl: z.string(),
  productUrl: z.string(),
});

export function createGetTodayDealsTool(
  transport: OliveyoungRequestOptions = {},
): ToolRegistration {
  const defaultTimeout = transport.timeout ?? (transport.relayUrl ? 60000 : 15000);
  return {
    name: 'oliveyoung_get_today_deals',
    metadata: {
      title: '올리브영 오특 조회',
      description:
        '올리브영 오특(오늘의 특가)의 오늘의 브랜드 특가와 오늘의 특가 상품 목록을 한국 날짜 기준으로 조회합니다. 실시간 매장 재고를 의미하지 않습니다.',
      inputSchema: {
        timeoutMs: z
          .number()
          .optional()
          .default(defaultTimeout)
          .describe(
            '전체 조회 제한 시간(ms, 기본값: 무료 릴레이 60000 / 직접 15000). 페이지 여러 개를 합친 시간입니다.',
          ),
      },
      outputSchema: {
        date: z.string(),
        brandDealCount: z.number(),
        todayDealCount: z.number(),
        truncated: z.boolean(),
        brandDeals: z.array(dealSchema),
        todayDeals: z.array(dealSchema),
        note: z.string(),
      },
    },
    handler: ((args: GetTodayDealsArgs) => getTodayDeals(args, transport)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
