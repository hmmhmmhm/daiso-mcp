/**
 * 디트릭스 API 상수 테스트
 */

import { describe, expect, it } from 'vitest';
import { DTRYX_API } from '../../../src/services/dtryx/api.js';

describe('디트릭스 API 상수', () => {
  it('표준 포트를 사용한다', () => {
    const url = new URL(DTRYX_API.BASE_URL);

    expect(url.protocol).toBe('https:');
    expect(url.port).toBe('');
  });

  it('비표준 포트를 포함하지 않는다', () => {
    // Cloudflare Workers 배포 환경에서 비표준 포트로 나가는 호출이
    // 간헐적으로 실패해 표준 포트를 유지해야 합니다.
    expect(DTRYX_API.BASE_URL).not.toMatch(/:\d+$/);
  });
});
