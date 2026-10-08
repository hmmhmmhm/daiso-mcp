import { describe, expect, it } from 'vitest';
import { ServiceError, toServiceErrorDiagnostics } from '../../src/core/errors.js';

describe('중계 정책 한도 안내', () => {
  it('자체 한도를 외부 서비스 장애로 안내하지 않는다', () => {
    const error = new ServiceError('CONVENIENCE_RELAY_FAILED', 'relay quota exceeded', 429, true, 429, { quotaReason: 'minute', retryAfter: 37 });
    expect(toServiceErrorDiagnostics(error, 'inventory').hint).toBe('중계 사용량 제한입니다. 37초 후 재시도해주세요.');
  });
});
