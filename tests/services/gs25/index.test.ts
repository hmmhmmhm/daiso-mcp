/**
 * GS25 서비스 테스트
 */

import { describe, expect, it } from 'vitest';
import { createGs25Service } from '../../../src/services/gs25/index.js';

describe('createGs25Service', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createGs25Service();

    expect(service.metadata).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createGs25Service();

    expect(service.metadata.id).toBe('gs25');
    expect(service.metadata.name).toBe('GS25');
    expect(service.metadata.version).toBe('1.0.0');
  });

  it('3개의 도구를 반환한다', () => {
    const service = createGs25Service();
    const tools = service.getTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'gs25_find_nearby_stores',
      'gs25_search_products',
      'gs25_check_inventory',
    ]);
  });
});
