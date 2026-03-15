/**
 * 메가박스 영화 목록 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchMegaboxBookingList, toYyyymmdd } from '../client.js';
import { resolveMegaboxNearestTheater } from '../location.js';

interface ListNowShowingArgs {
  playDate?: string;
  theaterId?: string;
  movieId?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  areaCode?: string;
  timeoutMs?: number;
}

async function listNowShowing(args: ListNowShowingArgs): Promise<McpToolResponse> {
  const {
    playDate = toYyyymmdd(),
    theaterId: inputTheaterId,
    movieId,
    keyword,
    latitude,
    longitude,
    areaCode,
    timeoutMs = 15000,
  } = args;
  let theaterId = inputTheaterId;
  let resolvedTheater = null;
  let resolvedLocation = null;

  if (!theaterId && (typeof latitude === 'number' || typeof longitude === 'number' || (keyword || '').trim().length > 0)) {
    const resolved = await resolveMegaboxNearestTheater(
      {
        keyword,
        latitude,
        longitude,
        areaCode,
        playDate,
        timeout: timeoutMs,
      },
      {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
        timeout: timeoutMs,
      },
    );
    theaterId = resolved.theater?.theaterId;
    resolvedTheater = resolved.theater;
    resolvedLocation = resolved.location;
  }

  const resolvedAreaCode = resolvedLocation?.areaCode || areaCode || '11';

  const { theaters, movies, showtimes } = await fetchMegaboxBookingList({
    playDate,
    theaterId,
    movieId,
    areaCode: resolvedAreaCode,
    timeout: timeoutMs,
  });

  const result = {
    playDate,
    filters: {
      theaterId: theaterId || null,
      movieId: movieId || null,
      keyword: keyword || null,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
      areaCode: resolvedAreaCode,
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
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createListNowShowingTool(): ToolRegistration {
  return {
    name: 'megabox_list_now_showing',
    metadata: {
      title: '메가박스 영화 목록 조회',
      description: '날짜/지점 조건으로 메가박스 영화 및 상영 회차 목록을 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterId: z.string().optional().describe('메가박스 지점 번호 (예: 1372)'),
        movieId: z.string().optional().describe('메가박스 영화 번호 (예: 25104500)'),
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 강남역)'),
        latitude: z.number().optional().describe('위도'),
        longitude: z.number().optional().describe('경도'),
        areaCode: z.string().optional().default('11').describe('지역 코드 (기본값: 11, 서울)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: listNowShowing as (args: unknown) => Promise<McpToolResponse>,
  };
}
