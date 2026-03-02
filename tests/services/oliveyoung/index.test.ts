/**
 * 올리브영 서비스 테스트
 */

import { describe, it, expect } from 'vitest';
import { createOliveyoungService } from '../../../src/services/oliveyoung/index.js';

describe('createOliveyoungService', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createOliveyoungService({ zyteApiKey: 'test-key' });

    expect(service.metadata).toBeDefined();
    expect(service.getTools).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createOliveyoungService();

    expect(service.metadata.id).toBe('oliveyoung');
    expect(service.metadata.name).toBe('올리브영');
    expect(service.metadata.version).toBe('1.0.0');
  });

  it('2개의 도구를 반환한다', () => {
    const service = createOliveyoungService({ zyteApiKey: 'test-key' });
    const tools = service.getTools();

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual([
      'oliveyoung_find_nearby_stores',
      'oliveyoung_check_inventory',
    ]);
  });
});
