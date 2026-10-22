/** 로컬 정책 한도만 검증된 재시도 헤더를 전달합니다. */
import { expect, it, vi } from 'vitest';
import {
  createHttpRelay,
  RelayError,
  type HttpRelayOptions,
} from '../../scripts/relay/http-relay.js';
function request() {
  return new Request('http://localhost/v1/test/read', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: '{}',
  });
}
function setup(takeQuota: HttpRelayOptions['takeQuota'], upstream = vi.fn(async () => ({}))) {
  return {
    upstream,
    relay: createHttpRelay('token', {
      prefix: '/v1/test/',
      operations: ['read'],
      validate: (value) => value,
      takeQuota,
      upstream,
    }),
  };
}
it.each([
  ['minute', 1],
  ['daily', 86400],
])('정책 %s 제한에 재시도 헤더를 반환한다', async (blockedBy, retryAfter) => {
  const takeQuota = Object.assign(async () => false, {
    status: () => ({ blockedBy, retryAfter }),
  }) as HttpRelayOptions['takeQuota'];
  const { relay, upstream } = setup(takeQuota);
  const response = await relay(request());
  expect(response.status).toBe(429);
  expect(response.headers.get('x-relay-quota-reason')).toBe(blockedBy);
  expect(response.headers.get('Retry-After')).toBe(String(retryAfter));
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(upstream).not.toHaveBeenCalled();
});
it.each([
  [null, 30],
  ['foo', 30],
  ['consumer', 30],
  ['minute', undefined],
  ['minute', '30'],
  ['minute', NaN],
  ['minute', Infinity],
  ['minute', 0],
  ['minute', -1],
  ['minute', 1.5],
  ['daily', 86401],
])('유효하지 않은 정책 상태는 헤더 없이 429를 유지한다: %s/%s', async (blockedBy, retryAfter) => {
  const takeQuota = Object.assign(async () => false, {
    status: () => ({ blockedBy, retryAfter }),
  }) as HttpRelayOptions['takeQuota'];
  const response = await setup(takeQuota).relay(request());
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBeNull();
  expect(response.headers.get('x-relay-quota-reason')).toBeNull();
});
it('상태 함수가 없거나 실패해도 기존 429 계약을 유지한다', async () => {
  for (const takeQuota of [
    async () => false,
    Object.assign(async () => false, {
      status: () => {
        throw new Error('private');
      },
    }),
  ]) {
    const response = await setup(takeQuota).relay(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(await response.text()).not.toContain('private');
  }
});
it('원본 오류는 로컬 정책 재시도 헤더를 주입하지 못한다', async () => {
  const upstream = vi.fn(async () => {
    throw Object.assign(new RelayError(429), { quota: { quotaReason: 'minute', retryAfter: 30 } });
  });
  const response = await setup(async () => true, upstream).relay(request());
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBeNull();
  expect(response.headers.get('x-relay-quota-reason')).toBeNull();
});
it.each([403, 200])('검증된 원본 HTTP %i만 진단 헤더로 전달한다', async (upstreamStatus) => {
  const upstream = vi.fn(async () => {
    throw new RelayError(502, undefined, undefined, upstreamStatus);
  });
  const response = await setup(async () => true, upstream).relay(request());
  expect(response.status).toBe(502);
  expect(response.headers.get('x-relay-upstream-status')).toBe(String(upstreamStatus));
  expect(response.headers.get('x-relay-quota-reason')).toBeNull();
  expect(await response.json()).toEqual({ error: 'Relay request failed' });
});
it.each([undefined, 99, 600, 403.5, NaN])(
  '원본 상태가 없거나 유효하지 않으면 진단 헤더를 생략한다: %s',
  async (upstreamStatus) => {
    const upstream = vi.fn(async () => {
      throw new RelayError(502, undefined, undefined, upstreamStatus);
    });
    expect(
      (await setup(async () => true, upstream).relay(request())).headers.get(
        'x-relay-upstream-status',
      ),
    ).toBeNull();
  },
);
