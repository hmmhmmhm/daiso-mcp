import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { compareProducts, parseCompareServices } from '../client.js';

interface CompareProductsArgs {
  keyword: string;
  limit?: number;
  services?: string;
}

async function compareProductsHandler(args: CompareProductsArgs): Promise<McpToolResponse> {
  const keyword = args.keyword?.trim();
  if (!keyword) {
    throw new Error('검색어(keyword)를 입력해주세요.');
  }

  const result = await compareProducts({
    keyword,
    limit: args.limit,
    services: parseCompareServices(args.services),
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: { ...result },
  };
}

export function createCompareProductsTool(): ToolRegistration {
  return {
    name: 'compare_products',
    metadata: {
      title: '가격 후보 통합 비교',
      description:
        '새 외부 키 없이 다이소, GS25, 세븐일레븐, 이마트24 상품 검색을 묶어 가격 후보를 비교합니다.',
      inputSchema: {
        keyword: z.string().describe('비교할 상품 검색어'),
        limit: z.number().optional().default(5).describe('서비스별 최대 결과 수'),
        services: z
          .string()
          .optional()
          .describe('쉼표로 구분한 서비스 목록(daiso,gs25,seveneleven,emart24)'),
      },
      outputSchema: {
        keyword: z.string().optional(),
        services: z.array(z.string()).optional(),
        serviceCount: z.number().optional(),
        resultCount: z.number().optional(),
        bestPrice: z.unknown().optional(),
        results: z.array(z.unknown()).optional(),
        errors: z.array(z.unknown()).optional(),
        note: z.string().optional(),
      },
    },
    handler: compareProductsHandler as (args: unknown) => Promise<McpToolResponse>,
  };
}
