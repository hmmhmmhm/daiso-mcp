/**
 * 디트릭스 서비스 프로바이더 테스트
 */

import { describe, expect, it } from 'vitest';
import { createDtryxService } from '../../../src/services/dtryx/index.js';

describe('디트릭스 서비스 프로바이더', () => {
  it('메타데이터를 노출한다', () => {
    const service = createDtryxService();

    expect(service.metadata.id).toBe('dtryx');
    expect(service.metadata.name).toBe('디트릭스');
  });

  it('도구 3종을 등록한다', () => {
    const names = createDtryxService()
      .getTools()
      .map((tool) => tool.name)
      .sort();

    expect(names).toEqual([
      'dtryx_get_remaining_seats',
      'dtryx_list_cinemas',
      'dtryx_list_now_showing',
    ]);
  });

  it('모든 도구 이름에 서비스 접두사가 있다', () => {
    expect(
      createDtryxService()
        .getTools()
        .every((tool) => tool.name.startsWith('dtryx_')),
    ).toBe(true);
  });
});
