/**
 * 공용 HTTP 유틸리티 테스트
 */

import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/utils/http.js';

describe('HttpError', () => {
  it('본문이 비어 있으면 상세 메시지를 붙이지 않는다', () => {
    const error = new HttpError(500, 'Internal Server Error', '   ');

    expect(error.message).toBe('API 요청 실패: 500 Internal Server Error');
    expect(error.bodyText).toBe('   ');
  });
});
