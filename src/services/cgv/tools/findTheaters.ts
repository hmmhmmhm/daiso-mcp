/**
 * CGV 극장 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCgvTheaters, toYyyymmdd } from '../client.js';

interface FindTheatersArgs {
  playDate?: string;
  regionCode?: string;
  limit?: number;
  timeoutMs?: number;
}

async function findTheaters(args: FindTheatersArgs): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), regionCode, limit = 30, timeoutMs = 15000 } = args;

  const theaters = await fetchCgvTheaters({
    playDate,
    regionCode,
    timeout: timeoutMs,
  });

  const sliced = theaters.slice(0, limit);
  const result = {
    playDate,
    filters: {
      regionCode: regionCode || null,
      limit,
    },
    count: sliced.length,
    theaters: sliced,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createFindTheatersTool(): ToolRegistration {
  return {
    name: 'cgv_find_theaters',
    metadata: {
      title: 'CGV 극장 검색',
      description: '지역 코드 기준으로 CGV 극장 목록을 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        regionCode: z.string().optional().describe('지역 코드 (예: 01 서울)'),
        limit: z.number().optional().default(30).describe('최대 결과 수 (기본값: 30)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: findTheaters as (args: unknown) => Promise<McpToolResponse>,
  };
}
