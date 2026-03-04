/**
 * CGV 서비스 테스트
 */

import { describe, expect, it } from 'vitest';
import { createCgvService } from '../../../src/services/cgv/index.js';

describe('createCgvService', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createCgvService();

    expect(service.metadata).toBeDefined();
    expect(service.getTools).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createCgvService();

    expect(service.metadata.id).toBe('cgv');
    expect(service.metadata.name).toBe('CGV');
    expect(service.metadata.version).toBe('1.0.0');
    expect(service.metadata.description).toBeDefined();
  });

  it('3개의 도구를 반환한다', () => {
    const service = createCgvService();
    const tools = service.getTools();

    expect(tools).toHaveLength(3);
    expect(tools.map((tool) => tool.name)).toEqual([
      'cgv_find_theaters',
      'cgv_search_movies',
      'cgv_get_timetable',
    ]);
  });
});
