/**
 * 롯데시네마 주변 지점 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { toYyyymmdd } from '../client.js';
import { fetchLotteCinemaNearbyTheaters } from '../location.js';

interface FindNearbyTheatersArgs {
  keyword?: string;
  latitude?: number;
  longitude?: number;
  playDate?: string;
  limit?: number;
  timeoutMs?: number;
}

async function findNearbyTheaters(
  args: FindNearbyTheatersArgs,
  googleMapsApiKey?: string,
): Promise<McpToolResponse> {
  const { keyword, latitude, longitude, playDate = toYyyymmdd(), limit = 10, timeoutMs = 15000 } = args;
  const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number';
  const nearby = await fetchLotteCinemaNearbyTheaters(
    {
      keyword,
      latitude: hasCoordinates ? latitude : keyword ? undefined : 37.5665,
      longitude: hasCoordinates ? longitude : keyword ? undefined : 126.978,
      playDate,
      limit,
      timeout: timeoutMs,
    },
    {
      timeout: timeoutMs,
      googleMapsApiKey: googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY,
    },
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(nearby, null, 2),
      },
    ],
  };
}

export function createFindNearbyTheatersTool(googleMapsApiKey?: string): ToolRegistration {
  return {
    name: 'lottecinema_find_nearby_theaters',
    metadata: {
      title: '롯데시네마 주변 지점 탐색',
      description: '위치 키워드 또는 좌표 기준으로 롯데시네마 지점을 거리순으로 조회합니다.',
      inputSchema: {
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 잠실역)'),
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        limit: z.number().optional().default(10).describe('반환할 최대 지점 수 (기본값: 10)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args) => findNearbyTheaters(args as FindNearbyTheatersArgs, googleMapsApiKey)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
