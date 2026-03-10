/**
 * 롯데시네마 잔여 좌석 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchLotteCinemaNowShowing, toYyyymmdd } from '../client.js';

interface GetRemainingSeatsArgs {
  playDate?: string;
  theaterId?: string;
  movieId?: string;
  limit?: number;
  timeoutMs?: number;
}

async function getRemainingSeats(args: GetRemainingSeatsArgs): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), theaterId, movieId, limit = 50, timeoutMs = 15000 } = args;
  const { showtimes } = await fetchLotteCinemaNowShowing({
    playDate,
    theaterId,
    movieId,
    timeout: timeoutMs,
  });

  const seats = showtimes
    .filter((item) => (theaterId ? item.theaterId === theaterId : true))
    .filter((item) => (movieId ? item.movieId === movieId : true))
    .sort((a, b) => {
      if (a.startTime === b.startTime) {
        return a.theaterName.localeCompare(b.theaterName);
      }
      return a.startTime.localeCompare(b.startTime);
    })
    .slice(0, limit);

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
              limit,
            },
            count: seats.length,
            seats,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createGetRemainingSeatsTool(): ToolRegistration {
  return {
    name: 'lottecinema_get_remaining_seats',
    metadata: {
      title: '롯데시네마 잔여 좌석 조회',
      description: '영화/지점/날짜 조건으로 롯데시네마 상영 회차별 남은 좌석 수를 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterId: z.string().optional().describe('롯데시네마 지점 ID (예: 1016)'),
        movieId: z.string().optional().describe('롯데시네마 대표 영화 코드 (예: 23816)'),
        limit: z.number().optional().default(50).describe('반환할 최대 회차 수 (기본값: 50)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: getRemainingSeats as (args: unknown) => Promise<McpToolResponse>,
  };
}
