/**
 * CGV 영화 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCgvMovies, toYyyymmdd } from '../client.js';
import { resolveCgvNearestTheater } from '../location.js';

interface SearchMoviesArgs {
  playDate?: string;
  theaterCode?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  timeoutMs?: number;
}

async function searchMovies(
  args: SearchMoviesArgs,
  apiKey?: string,
  googleMapsApiKey?: string,
): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), theaterCode, keyword, latitude, longitude, timeoutMs = 15000 } = args;
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
  const movies = shouldReturnEmpty
    ? []
    : await fetchCgvMovies({
        playDate,
        theaterCode: targetTheaterCode,
        timeout: timeoutMs,
        zyteApiKey: apiKey,
      });

  const result = {
    playDate,
    filters: {
      theaterCode: targetTheaterCode || null,
      keyword: keyword || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    },
    resolvedTheater,
    count: movies.length,
    movies,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createSearchMoviesTool(apiKey?: string, googleMapsApiKey?: string): ToolRegistration {
  return {
    name: 'cgv_search_movies',
    metadata: {
      title: 'CGV 영화 검색',
      description: 'CGV 상영 영화 목록을 조회합니다. 극장 코드가 없으면 위치 키워드 기준 최근접 극장을 선택할 수 있습니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterCode: z.string().optional().describe('CGV 극장 코드 (예: 0056)'),
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 강남역)'),
        latitude: z.number().optional().describe('위도'),
        longitude: z.number().optional().describe('경도'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args) => searchMovies(args as SearchMoviesArgs, apiKey, googleMapsApiKey)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
