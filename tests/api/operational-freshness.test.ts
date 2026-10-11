import { expect, it } from 'vitest';
import { isFreshOperationalRequest } from '../../src/api/operationalFreshness.js';
import type { ApiContext } from '../../src/api/response.js';

it.each([
  ['true', 'test-secret', 'test-secret', true],
  ['true', 'wrong-secret', 'test-secret', false],
  ['true', 'test-secret', undefined, false],
  [undefined, 'test-secret', 'test-secret', false],
  ['false', 'test-secret', 'test-secret', false],
])('운영 fresh=%s 인증=%s 설정=%s 조건을 검증한다', async (flag, token, secret, expected) => {
  const headers = new Headers({ 'x-health-check-key': token });
  if (flag) headers.set('x-health-check-force-fresh', flag);
  const c = {
    req: { raw: { headers } },
    env: { HEALTH_CHECK_SECRET: secret },
  } as unknown as ApiContext;
  expect(await isFreshOperationalRequest(c)).toBe(expected);
});
