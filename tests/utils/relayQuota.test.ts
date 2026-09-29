import { expect, it } from 'vitest';
import { createRelayCooldown, parseRelayQuota } from '../../src/utils/relayQuota.js';
it('헤더 없는 응답이나 누락된 재시도 값을 거부한다', () => {
  expect(parseRelayQuota(429)).toBeUndefined();
  expect(parseRelayQuota(429, new Headers({ 'x-relay-quota-reason': 'minute' }))).toBeUndefined();
});
it('휴지 표는 용량을 넘지 않고 더 짧은 휴지로 기존 시간을 줄이지 않는다', () => {
  let now = 0;
  const cooldown = createRelayCooldown(() => now, 1);
  cooldown.set('scope', 'a', { quotaReason: 'consumer', retryAfter: 10 });
  cooldown.set('other', 'b', { quotaReason: 'daily', retryAfter: 10 });
  expect(cooldown.get('other', 'b')).toBeUndefined();
  expect(cooldown.get('scope', 'b')).toBeUndefined();
  cooldown.set('scope', 'a', { quotaReason: 'consumer', retryAfter: 5 });
  expect(cooldown.get('scope', 'a')).toEqual({ quotaReason: 'consumer', retryAfter: 10 });
  cooldown.set('scope', 'a', { quotaReason: 'consumer', retryAfter: 11 });
  now = 1000;
  expect(cooldown.get('scope', 'a')?.retryAfter).toBe(10);
  now = 11000;
  cooldown.set('other', 'b', { quotaReason: 'minute', retryAfter: 10 });
  expect(cooldown.get('other', 'a')?.retryAfter).toBe(10);
});
