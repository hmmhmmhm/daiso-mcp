/**
 * 롯데마트 서비스 테스트
 */

import { describe, expect, it } from 'vitest';
import { createLotteMartService } from '../../../src/services/lottemart/index.js';

describe('createLotteMartService', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createLotteMartService();

    expect(service.metadata).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createLotteMartService();

    expect(service.metadata.id).toBe('lottemart');
    expect(service.metadata.name).toBe('롯데마트');
    expect(service.metadata.version).toBe('1.0.0');
  });

  it('2개의 도구를 반환한다', () => {
    const service = createLotteMartService();
    const tools = service.getTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'lottemart_find_nearby_stores',
      'lottemart_search_products',
    ]);
  });
});
