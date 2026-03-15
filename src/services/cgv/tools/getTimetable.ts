/**
 * CGV 시간표 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCgvTimetable, toYyyymmdd } from '../client.js';
import { resolveCgvNearestTheater } from '../location.js';
import { filterAndSortTimetable } from '../timetable.js';

interface GetTimetableArgs {
  playDate?: string;
  theaterCode?: string;
  movieCode?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
  timeoutMs?: number;
}

async function getTimetable(
  args: GetTimetableArgs,
  apiKey?: string,
  googleMapsApiKey?: string,
): Promise<McpToolResponse> {
  const {
    playDate = toYyyymmdd(),
    theaterCode,
    movieCode,
    keyword,
    latitude,
    longitude,
    limit = 50,
    timeoutMs = 15000,
  } = args;
  let resolvedTheater = null;
  let targetTheaterCode = theaterCode;

  if (!targetTheaterCode && (keyword || typeof latitude === 'number' || typeof longitude === 'number')) {
    const resolved = await resolveCgvNearestTheater(
      {
        playDate,
        keyword,
        latitude,
        longitude,
        timeout: timeoutMs,
      },
      {
        timeout: timeoutMs,
        zyteApiKey: apiKey,
        googleMapsApiKey: googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY,
      },
    );
    resolvedTheater = resolved.theater;
    targetTheaterCode = resolved.theater?.theaterCode;
  }

  const shouldReturnEmpty =
    !targetTheaterCode && (keyword || typeof latitude === 'number' || typeof longitude === 'number');
  const timetable = shouldReturnEmpty
    ? []
    : await fetchCgvTimetable({
        playDate,
        theaterCode: targetTheaterCode,
        movieCode,
        timeout: timeoutMs,
        zyteApiKey: apiKey,
      });

  const filtered = filterAndSortTimetable(timetable, { theaterCode: targetTheaterCode, movieCode, limit });

  const result = {
    playDate,
    filters: {
      theaterCode: targetTheaterCode || null,
      movieCode: movieCode || null,
      keyword: keyword || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      limit,
    },
    resolvedTheater,
    count: filtered.length,
    timetable: filtered,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createGetTimetableTool(apiKey?: string, googleMapsApiKey?: string): ToolRegistration {
  return {
    name: 'cgv_get_timetable',
    metadata: {
      title: 'CGV 시간표 조회',
      description: '날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다. 극장 코드가 없으면 위치 키워드 기준 최근접 극장을 선택할 수 있습니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterCode: z.string().optional().describe('CGV 극장 코드 (예: 0056)'),
        movieCode: z.string().optional().describe('CGV 영화 코드'),
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 강남역)'),
        latitude: z.number().optional().describe('위도'),
        longitude: z.number().optional().describe('경도'),
        limit: z.number().optional().default(50).describe('최대 결과 수 (기본값: 50)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args) => getTimetable(args as GetTimetableArgs, apiKey, googleMapsApiKey)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
