/**
 * 롯데시네마 영화 목록 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchLotteCinemaNowShowing, toYyyymmdd } from '../client.js';

interface ListNowShowingArgs {
  playDate?: string;
  theaterId?: string;
  movieId?: string;
  timeoutMs?: number;
}

async function listNowShowing(args: ListNowShowingArgs): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), theaterId, movieId, timeoutMs = 15000 } = args;
  const { theaters, movies, showtimes } = await fetchLotteCinemaNowShowing({
    playDate,
    theaterId,
    movieId,
    timeout: timeoutMs,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            playDate,
            filters: {
              theaterId: theaterId || null,
              movieId: movieId || null,
            },
            counts: {
              theaters: theaters.length,
              movies: movies.length,
              showtimes: showtimes.length,
            },
            theaters,
            movies,
            showtimes,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createListNowShowingTool(): ToolRegistration {
  return {
    name: 'lottecinema_list_now_showing',
    metadata: {
      title: '롯데시네마 영화 목록 조회',
      description: '날짜/지점/영화 조건으로 롯데시네마 영화 및 상영 회차 목록을 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterId: z.string().optional().describe('롯데시네마 지점 ID (예: 1016)'),
        movieId: z.string().optional().describe('롯데시네마 대표 영화 코드 (예: 23816)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: listNowShowing as (args: unknown) => Promise<McpToolResponse>,
  };
}
