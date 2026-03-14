/**
 * 세븐일레븐 카탈로그 스냅샷 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchSevenElevenCatalogSnapshot } from '../client.js';

interface GetCatalogSnapshotArgs {
  includeIssues?: boolean;
  includeExhibition?: boolean;
  limit?: number;
  timeoutMs?: number;
}

async function getCatalogSnapshot(args: GetCatalogSnapshotArgs): Promise<McpToolResponse> {
  const { includeIssues = true, includeExhibition = true, limit = 20, timeoutMs = 15000 } = args;

  const result = await fetchSevenElevenCatalogSnapshot({
    includeIssues,
    includeExhibition,
    timeout: timeoutMs,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            options: {
              includeIssues,
              includeExhibition,
              limit,
            },
            pages: {
              totalCount: result.pages.length,
              items: result.pages.slice(0, limit),
            },
            issues: {
              totalCount: result.issues.length,
              items: result.issues.slice(0, limit),
            },
            exhibitions: {
              totalCount: result.exhibitions.length,
              items: result.exhibitions.slice(0, limit),
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createGetCatalogSnapshotTool(): ToolRegistration {
  return {
    name: 'seveneleven_get_catalog_snapshot',
    metadata: {
      title: '세븐일레븐 카탈로그 스냅샷',
      description: '세븐일레븐 공개 카탈로그(페이지/이슈/기획전) 데이터를 조회합니다.',
      inputSchema: {
        includeIssues: z.boolean().optional().default(true).describe('이슈 상품 포함 여부 (기본값: true)'),
        includeExhibition: z.boolean().optional().default(true).describe('기획전 포함 여부 (기본값: true)'),
        limit: z.number().optional().default(20).describe('각 목록 최대 반환 수 (기본값: 20)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: getCatalogSnapshot as (args: unknown) => Promise<McpToolResponse>,
  };
}
