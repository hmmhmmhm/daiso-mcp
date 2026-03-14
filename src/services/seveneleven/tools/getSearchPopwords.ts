/**
 * 세븐일레븐 인기 검색어 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchSevenElevenSearchPopwords } from '../client.js';

interface GetSearchPopwordsArgs {
  label?: string;
  timeoutMs?: number;
}

async function getSearchPopwords(args: GetSearchPopwordsArgs): Promise<McpToolResponse> {
  const { label = 'home', timeoutMs = 15000 } = args;

  const keywords = await fetchSevenElevenSearchPopwords(label, {
    timeout: timeoutMs,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            label,
            count: keywords.length,
            keywords,
            note:
              keywords.length === 0
                ? '현재 응답에서 인기 검색어 목록을 찾지 못했습니다.'
                : '홈 인기 검색어를 조회했습니다.',
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createGetSearchPopwordsTool(): ToolRegistration {
  return {
    name: 'seveneleven_get_search_popwords',
    metadata: {
      title: '세븐일레븐 인기 검색어 조회',
      description: '세븐일레븐 인기 검색어 목록을 조회합니다.',
      inputSchema: {
        label: z.string().optional().default('home').describe('조회 라벨 (기본값: home)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: getSearchPopwords as (args: unknown) => Promise<McpToolResponse>,
  };
}
