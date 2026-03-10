/**
 * 롯데시네마 서비스 테스트
 */

import { describe, expect, it } from 'vitest';
import { createLotteCinemaService } from '../../../src/services/lottecinema/index.js';

describe('createLotteCinemaService', () => {
  it('올바른 메타데이터와 도구를 반환한다', () => {
    const service = createLotteCinemaService();
    const tools = service.getTools();

    expect(service.metadata.id).toBe('lottecinema');
    expect(service.metadata.name).toBe('롯데시네마');
    expect(tools.map((tool) => tool.name)).toEqual([
      'lottecinema_find_nearby_theaters',
      'lottecinema_list_now_showing',
      'lottecinema_get_remaining_seats',
    ]);
  });
});
