/**
 * 세븐일레븐 서비스 테스트
 */

import { describe, expect, it } from 'vitest';
import { createSevenElevenService } from '../../../src/services/seveneleven/index.js';

describe('createSevenElevenService', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createSevenElevenService();

    expect(service.metadata).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createSevenElevenService();

    expect(service.metadata.id).toBe('seveneleven');
    expect(service.metadata.name).toBe('세븐일레븐');
    expect(service.metadata.version).toBe('1.0.0');
  });

  it('5개의 도구를 반환한다', () => {
    const service = createSevenElevenService();
    const tools = service.getTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'seveneleven_search_products',
      'seveneleven_search_stores',
      'seveneleven_check_inventory',
      'seveneleven_get_search_popwords',
      'seveneleven_get_catalog_snapshot',
    ]);
  });
});
