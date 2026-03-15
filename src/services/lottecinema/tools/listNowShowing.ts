/**
 * 롯데시네마 영화 목록 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchLotteCinemaNowShowing, toYyyymmdd } from '../client.js';
import { resolveLotteCinemaNearestTheater } from '../location.js';

interface ListNowShowingArgs {
  playDate?: string;
  theaterId?: string;
  movieId?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  timeoutMs?: number;
}

async function listNowShowing(args: ListNowShowingArgs, googleMapsApiKey?: string): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), theaterId, movieId, keyword, latitude, longitude, timeoutMs = 15000 } = args;
  let resolvedTheater = null;
  let targetTheaterId = theaterId;

  if (!targetTheaterId && (keyword || typeof latitude === 'number' || typeof longitude === 'number')) {
    const resolved = await resolveLotteCinemaNearestTheater(
      {
        playDate,
        keyword,
        latitude,
        longitude,
        timeout: timeoutMs,
      },
      {
        timeout: timeoutMs,
        googleMapsApiKey: googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY,
      },
    );
    resolvedTheater = resolved.theater;
    targetTheaterId = resolved.theater?.theaterId;
  }

  const shouldReturnEmpty =
    !targetTheaterId && (keyword || typeof latitude === 'number' || typeof longitude === 'number');
  const { theaters, movies, showtimes } = shouldReturnEmpty
    ? { theaters: [], movies: [], showtimes: [] }
    : await fetchLotteCinemaNowShowing({
      playDate,
      theaterId: targetTheaterId,
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
              theaterId: targetTheaterId || null,
              movieId: movieId || null,
              keyword: keyword || null,
              latitude: latitude ?? null,
              longitude: longitude ?? null,
            },
            resolvedTheater,
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

export function createListNowShowingTool(googleMapsApiKey?: string): ToolRegistration {
  return {
    name: 'lottecinema_list_now_showing',
    metadata: {
      title: '롯데시네마 영화 목록 조회',
      description: '날짜/지점/영화 조건으로 롯데시네마 영화 및 상영 회차 목록을 조회합니다. 지점 ID가 없으면 위치 키워드 기준 최근접 극장을 선택할 수 있습니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterId: z.string().optional().describe('롯데시네마 지점 ID (예: 1016)'),
        movieId: z.string().optional().describe('롯데시네마 대표 영화 코드 (예: 23816)'),
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 잠실역)'),
        latitude: z.number().optional().describe('위도'),
        longitude: z.number().optional().describe('경도'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args) => listNowShowing(args as ListNowShowingArgs, googleMapsApiKey)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
