/**
 * CGV 영화 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCgvMovies, toYyyymmdd } from '../client.js';

interface SearchMoviesArgs {
  playDate?: string;
  theaterCode?: string;
  timeoutMs?: number;
}

async function searchMovies(args: SearchMoviesArgs): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), theaterCode, timeoutMs = 15000 } = args;

  const movies = await fetchCgvMovies({
    playDate,
    theaterCode,
    timeout: timeoutMs,
  });

  const result = {
    playDate,
    filters: {
      theaterCode: theaterCode || null,
    },
    count: movies.length,
    movies,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createSearchMoviesTool(): ToolRegistration {
  return {
    name: 'cgv_search_movies',
    metadata: {
      title: 'CGV 영화 검색',
      description: 'CGV 상영 영화 목록을 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterCode: z.string().optional().describe('CGV 극장 코드 (예: 0056)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: searchMovies as (args: unknown) => Promise<McpToolResponse>,
  };
}
