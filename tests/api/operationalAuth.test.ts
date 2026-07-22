import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  authorizeOperationalRequest,
  readOperationalToken,
} from '../../src/api/operationalAuth.js';

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
  it('설정된 시크릿이 없으면 not-configured를 반환한다', async () => {
    const headers = new Headers({ Authorization: 'Bearer request-secret' });

    await expect(authorizeOperationalRequest(headers, '   ')).resolves.toBe('not-configured');
  });

  it('요청 토큰과 설정된 시크릿이 일치하면 authorized를 반환한다', async () => {
    const headers = new Headers({ Authorization: 'Bearer request-secret' });

    await expect(authorizeOperationalRequest(headers, '  request-secret  ')).resolves.toBe(
      'authorized',
    );
  });

  it('요청 토큰이 올바르지 않으면 unauthorized를 반환한다', async () => {
    const headers = new Headers({ Authorization: 'Bearer wrong-secret' });

    await expect(authorizeOperationalRequest(headers, 'request-secret')).resolves.toBe(
      'unauthorized',
    );
  });

  it('요청 토큰이 없으면 unauthorized를 반환한다', async () => {
    await expect(authorizeOperationalRequest(new Headers(), 'request-secret')).resolves.toBe(
      'unauthorized',
    );
  });

  it('길이가 다른 토큰도 예외 없이 unauthorized를 반환한다', async () => {
    const headers = new Headers({ Authorization: 'Bearer short' });

    await expect(authorizeOperationalRequest(headers, 'a-much-longer-secret')).resolves.toBe(
      'unauthorized',
    );
  });

  it('같은 길이와 접두사를 가진 다른 토큰도 예외 없이 unauthorized를 반환한다', async () => {
    const headers = new Headers({ Authorization: 'Bearer shared-prefix-a' });

    await expect(authorizeOperationalRequest(headers, 'shared-prefix-b')).resolves.toBe(
      'unauthorized',
    );
  });

  it('Workers timingSafeEqual에는 고정 길이 SHA-256 다이제스트를 전달한다', async () => {
    const originalTimingSafeEqual = crypto.subtle.timingSafeEqual;
    const timingSafeEqual = vi.fn((left: ArrayBuffer, right: ArrayBuffer) => {
      expect(left.byteLength).toBe(32);
      expect(right.byteLength).toBe(32);
      return nodeTimingSafeEqual(new Uint8Array(left), new Uint8Array(right));
    });
    Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
      configurable: true,
      value: timingSafeEqual,
    });

    try {
      const headers = new Headers({ Authorization: 'Bearer request-secret' });

      await expect(authorizeOperationalRequest(headers, 'request-secret')).resolves.toBe(
        'authorized',
      );
      expect(timingSafeEqual).toHaveBeenCalledOnce();
    } finally {
      if (typeof originalTimingSafeEqual === 'function') {
        Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
          configurable: true,
          value: originalTimingSafeEqual,
        });
      } else {
        Reflect.deleteProperty(crypto.subtle, 'timingSafeEqual');
      }
    }
  });
});
