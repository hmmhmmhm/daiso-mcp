/**
 * 다이소 서비스 테스트
 */
import { describe, it, expect } from 'vitest';
import { createDaisoService, getImageUrl, formatTime } from '../../../src/services/daiso/index.js';

describe('createDaisoService', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createDaisoService();

    expect(service.metadata).toBeDefined();
    expect(service.getTools).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createDaisoService();

    expect(service.metadata.id).toBe('daiso');
    expect(service.metadata.name).toBe('다이소');
    expect(service.metadata.version).toBe('1.0.0');
    expect(service.metadata.description).toBeDefined();
  });

  it('5개의 도구를 반환한다', () => {
    const service = createDaisoService();
    const tools = service.getTools();

    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      'daiso_search_products',
      'daiso_find_stores',
      'daiso_check_inventory',
      'daiso_get_price_info',
      'daiso_get_display_location',
    ]);
  });

  it('각 도구는 필수 속성을 가진다', () => {
    const service = createDaisoService();
    const tools = service.getTools();

    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.metadata.title).toBeDefined();
      expect(tool.metadata.description).toBeDefined();
      expect(tool.metadata.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });
});

describe('re-exported functions', () => {
  it('getImageUrl이 정상적으로 동작한다', () => {
    const url = getImageUrl('/test/image.jpg');
    expect(url).toContain('/test/image.jpg');
  });

  it('formatTime이 정상적으로 동작한다', () => {
    expect(formatTime('0930')).toBe('09:30');
  });
});
