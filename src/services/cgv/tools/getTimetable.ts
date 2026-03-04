/**
 * CGV 시간표 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCgvTimetable, toYyyymmdd } from '../client.js';

interface GetTimetableArgs {
  playDate?: string;
  theaterCode?: string;
  movieCode?: string;
  limit?: number;
  timeoutMs?: number;
}

async function getTimetable(args: GetTimetableArgs): Promise<McpToolResponse> {
  const {
    playDate = toYyyymmdd(),
    theaterCode,
    movieCode,
    limit = 50,
    timeoutMs = 15000,
  } = args;

  const timetable = await fetchCgvTimetable({
    playDate,
    theaterCode,
    movieCode,
    timeout: timeoutMs,
  });

  const filtered = timetable
    .filter((item) => (theaterCode ? item.theaterCode === theaterCode : true))
    .filter((item) => (movieCode ? item.movieCode === movieCode : true))
    .sort((a, b) => {
      if (a.startTime === b.startTime) {
        return a.theaterName.localeCompare(b.theaterName);
      }
      return a.startTime.localeCompare(b.startTime);
    })
    .slice(0, limit);

  const result = {
    playDate,
    filters: {
      theaterCode: theaterCode || null,
      movieCode: movieCode || null,
      limit,
    },
    count: filtered.length,
    timetable: filtered,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createGetTimetableTool(): ToolRegistration {
  return {
    name: 'cgv_get_timetable',
    metadata: {
      title: 'CGV 시간표 조회',
      description: '날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterCode: z.string().optional().describe('CGV 극장 코드 (예: 0056)'),
        movieCode: z.string().optional().describe('CGV 영화 코드'),
        limit: z.number().optional().default(50).describe('최대 결과 수 (기본값: 50)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: getTimetable as (args: unknown) => Promise<McpToolResponse>,
  };
}
