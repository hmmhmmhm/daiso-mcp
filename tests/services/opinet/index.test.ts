import { describe, expect, it, vi } from 'vitest';
import { createOpinetService } from '../../../src/services/opinet/index.js';

describe('createOpinetService', () => {
  it('오피넷 MCP 도구를 등록한다', () => {
    const service = createOpinetService({ apiKey: 'key' });

    expect(service.metadata.id).toBe('opinet');
    expect(service.getTools().map((tool) => tool.name)).toEqual([
      'opinet_get_average_prices',
      'opinet_get_lowest_price_stations',
      'opinet_search_stations_around',
      'opinet_get_station_detail',
    ]);
  });

  it('MCP 도구 핸들러가 오피넷 결과를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = String(input);
        if (url.includes('avgAllPrice')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ RESULT: { OIL: [{ PRODCD: 'B027', PRODNM: '휘발유', PRICE: '1' }] } }),
            ),
          );
        }
        if (url.includes('lowTop10')) {
          return Promise.resolve(
            new Response(JSON.stringify({ RESULT: { OIL: [{ UNI_ID: 'A1', OS_NM: '저가' }] } })),
          );
        }
        if (url.includes('aroundAll')) {
          return Promise.resolve(
            new Response(JSON.stringify({ RESULT: { OIL: [{ UNI_ID: 'A2', OS_NM: '근처' }] } })),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ RESULT: { OIL: [{ UNI_ID: 'A3', OS_NM: '상세' }] } })),
        );
      }),
    );
    const service = createOpinetService({ apiKey: 'key' });
    const tools = service.getTools();

    const average = await tools[0].handler({});
    const lowest = await tools[1].handler({ fuelCode: 'B027', count: 1 });
    const around = await tools[2].handler({ x: 1, y: 2 });
    const detail = await tools[3].handler({ stationId: 'A3' });

    expect(average.structuredContent?.provider).toBe('opinet');
    expect(lowest.content[0]?.text).toContain('저가');
    expect(around.content[0]?.text).toContain('근처');
    expect(detail.content[0]?.text).toContain('상세');
  });
});
