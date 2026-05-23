/**
 * 장소 검색 서비스 프로바이더 테스트
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlacesService } from '../../../src/services/places/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPlacesService', () => {
  it('네이버 지역 검색 MCP 도구를 등록한다', () => {
    const service = createPlacesService({
      naverClientId: 'client-id',
      naverClientSecret: 'client-secret',
    });

    expect(service.metadata.id).toBe('places');
    expect(service.getTools().map((tool) => tool.name)).toEqual(['places_search_nearby']);
  });

  it('MCP 도구 핸들러가 장소 검색 결과를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            total: 1,
            items: [{ title: '카페', category: '카페,디저트>카페' }],
          }),
        ),
      ),
    );
    const service = createPlacesService({
      naverClientId: 'client-id',
      naverClientSecret: 'client-secret',
    });
    const tool = service.getTools()[0];

    const result = await tool.handler({ location: '강남역', category: 'cafe' });

    expect(result.structuredContent?.query).toBe('강남역 카페');
    expect(result.content[0]?.text).toContain('"places"');
  });
});
