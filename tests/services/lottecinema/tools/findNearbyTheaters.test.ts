/**
 * 롯데시네마 주변 지점 탐색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFindNearbyTheatersTool } from '../../../../src/services/lottecinema/tools/findNearbyTheaters.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFindNearbyTheatersTool', () => {
  it('거리순 지점을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          IsOK: true,
          Cinemas: {
            Cinemas: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5132941',
                  Longitude: '127.104215',
                  CinemaAddrSummary: '서울 송파구 올림픽로 300',
                },
                {
                  CinemaID: '1001',
                  CinemaNameKR: '건대입구',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5405',
                  Longitude: '127.0693',
                  CinemaAddrSummary: '서울 광진구 아차산로 262',
                },
              ],
            },
          },
          Movies: { Movies: { Items: [] } },
        }),
      ),
    );

    const tool = createFindNearbyTheatersTool();
    const result = await tool.handler({ latitude: 37.5132941, longitude: 127.104215, limit: 2 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.count).toBe(2);
    expect(parsed.theaters[0].theaterId).toBe('1016');
    expect(parsed.theaters[0].distanceKm).toBe(0);
  });
});
