import { describe, expect, it } from 'vitest';
import { authorizeOperationalRequest, readOperationalToken } from '../../src/api/operationalAuth.js';

describe('readOperationalToken', () => {
  it('Bearer 토큰을 대소문자와 공백을 무시해 우선 사용한다', () => {
    const headers = new Headers({
      Authorization: 'bEaReR   bearer-secret  ',
      'x-health-check-key': 'health-check-secret',
    });

    expect(readOperationalToken(headers)).toBe('bearer-secret');
  });

  it('Bearer 토큰이 없으면 x-health-check-key를 사용한다', () => {
    const headers = new Headers({ 'x-health-check-key': '  health-check-secret  ' });

    expect(readOperationalToken(headers)).toBe('health-check-secret');
  });
});

describe('authorizeOperationalRequest', () => {
  it('설정된 시크릿이 없으면 not-configured를 반환한다', () => {
    const headers = new Headers({ Authorization: 'Bearer request-secret' });

    expect(authorizeOperationalRequest(headers, '   ')).toBe('not-configured');
  });

  it('요청 토큰과 설정된 시크릿이 일치하면 authorized를 반환한다', () => {
    const headers = new Headers({ Authorization: 'Bearer request-secret' });

    expect(authorizeOperationalRequest(headers, '  request-secret  ')).toBe('authorized');
  });

  it('요청 토큰이 올바르지 않으면 unauthorized를 반환한다', () => {
    const headers = new Headers({ Authorization: 'Bearer wrong-secret' });

    expect(authorizeOperationalRequest(headers, 'request-secret')).toBe('unauthorized');
  });

  it('요청 토큰이 없으면 unauthorized를 반환한다', () => {
    expect(authorizeOperationalRequest(new Headers(), 'request-secret')).toBe('unauthorized');
  });
});
