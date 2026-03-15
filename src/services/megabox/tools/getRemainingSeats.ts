/**
 * 메가박스 잔여 좌석 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchMegaboxBookingList, toYyyymmdd } from '../client.js';
import { resolveMegaboxNearestTheater } from '../location.js';

interface GetRemainingSeatsArgs {
  playDate?: string;
  theaterId?: string;
  movieId?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  areaCode?: string;
  limit?: number;
  timeoutMs?: number;
}

async function getRemainingSeats(args: GetRemainingSeatsArgs): Promise<McpToolResponse> {
  const {
    playDate = toYyyymmdd(),
    theaterId: inputTheaterId,
    movieId,
    keyword,
    latitude,
    longitude,
    areaCode,
    limit = 50,
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

  const { showtimes } = await fetchMegaboxBookingList({
    playDate,
    theaterId,
    movieId,
    areaCode: resolvedAreaCode,
    timeout: timeoutMs,
  });

  const filteredShowtimes = showtimes
    .filter((item) => (theaterId ? item.theaterId === theaterId : true))
    .filter((item) => (movieId ? item.movieId === movieId : true))
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
      theaterId: theaterId || null,
      movieId: movieId || null,
      keyword: keyword || null,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
      areaCode: resolvedAreaCode,
      limit,
    },
    resolvedTheater,
    count: filteredShowtimes.length,
    seats: filteredShowtimes,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createGetRemainingSeatsTool(): ToolRegistration {
  return {
    name: 'megabox_get_remaining_seats',
    metadata: {
      title: '메가박스 잔여 좌석 조회',
      description: '영화/지점/날짜 조건으로 상영 회차별 남은 좌석 수를 조회합니다.',
      inputSchema: {
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        theaterId: z.string().optional().describe('메가박스 지점 번호 (예: 1372)'),
        movieId: z.string().optional().describe('메가박스 영화 번호 (예: 25104500)'),
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 강남역)'),
        latitude: z.number().optional().describe('위도'),
        longitude: z.number().optional().describe('경도'),
        areaCode: z.string().optional().default('11').describe('지역 코드 (기본값: 11, 서울)'),
        limit: z.number().optional().default(50).describe('반환할 최대 회차 수 (기본값: 50)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: getRemainingSeats as (args: unknown) => Promise<McpToolResponse>,
  };
}
