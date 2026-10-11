/** 인증된 운영 점검만 서비스 내부 캐시를 우회할 수 있습니다. */
import type { ApiContext } from './response.js';
import { authorizeOperationalRequest } from './operationalAuth.js';

export async function isFreshOperationalRequest(c: ApiContext): Promise<boolean> {
  const headers = c.req.raw?.headers;
  if (headers?.get('x-health-check-force-fresh') !== 'true') return false;
  return (await authorizeOperationalRequest(headers, c.env?.HEALTH_CHECK_SECRET)) === 'authorized';
}
