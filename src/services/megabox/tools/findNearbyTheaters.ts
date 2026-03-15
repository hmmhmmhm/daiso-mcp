/**
 * 메가박스 주변 지점 탐색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { toYyyymmdd } from '../client.js';
import { fetchMegaboxNearbyTheaters } from '../location.js';

interface FindNearbyTheatersArgs {
  keyword?: string;
  latitude?: number;
  longitude?: number;
  playDate?: string;
  areaCode?: string;
  limit?: number;
  timeoutMs?: number;
}

async function findNearbyTheaters(args: FindNearbyTheatersArgs): Promise<McpToolResponse> {
  const {
    keyword,
    latitude,
    longitude,
    playDate = toYyyymmdd(),
    areaCode,
    limit = 10,
    timeoutMs = 15000,
  } = args;

  const result = await fetchMegaboxNearbyTheaters(
    {
      keyword,
      latitude,
      longitude,
      playDate,
      areaCode,
      limit,
      timeout: timeoutMs,
    },
    {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      timeout: timeoutMs,
    }
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createFindNearbyTheatersTool(): ToolRegistration {
  return {
    name: 'megabox_find_nearby_theaters',
    metadata: {
      title: '메가박스 주변 지점 탐색',
      description: '사용자 좌표 또는 위치 키워드 기준으로 메가박스 지점을 거리순으로 조회합니다.',
      inputSchema: {
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 강남역)'),
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        playDate: z.string().optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        areaCode: z.string().optional().default('11').describe('지역 코드 (기본값: 11, 서울)'),
        limit: z.number().optional().default(10).describe('반환할 최대 지점 수 (기본값: 10)'),
        timeoutMs: z.number().optional().default(15000).describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: findNearbyTheaters as (args: unknown) => Promise<McpToolResponse>,
  };
}
