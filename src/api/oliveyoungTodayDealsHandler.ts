import { isFreshOperationalRequest } from './operationalFreshness.js';
/**
 * 올리브영 오특(오늘의 특가) GET API 핸들러
 *
 * MCP get_catalog(service=oliveyoung, operation=today_deals)와 같은 본문을 반환합니다.
 * /browse/oliveyoung/today-deals 웹 조회도 이 핸들러를 사용합니다.
 */

import { ServiceError } from '../core/errors.js';
import { fetchOliveyoungTodayDeals } from '../services/oliveyoung/todayDeals.js';
import { buildTodayDealsBody } from '../services/oliveyoung/tools/getTodayDeals.js';
import {
  type ApiContext,
  errorResponse,
  serviceErrorResponse,
  successResponse,
} from './response.js';

/**
 * GET /api/oliveyoung/today-deals
 */
export async function handleOliveyoungGetTodayDeals(c: ApiContext) {
  const defaultTimeoutMs = c.env?.OY_RELAY_URL ? 60000 : 15000;
  const parsedTimeoutMs = parseInt(c.req.query('timeoutMs') || '', 10);
  const timeoutMs =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0 ? parsedTimeoutMs : defaultTimeoutMs;

  try {
    const result = await fetchOliveyoungTodayDeals({
      bypassCache: await isFreshOperationalRequest(c),
      relayUrl: c.env?.OY_RELAY_URL,
      relayToken: c.env?.OY_RELAY_TOKEN,
      accessClientId: c.env?.OY_ACCESS_CLIENT_ID,
      accessClientSecret: c.env?.OY_ACCESS_CLIENT_SECRET,
      timeout: timeoutMs,
    });
    return successResponse(c, buildTodayDealsBody(result));
  } catch (error) {
    if (error instanceof ServiceError) return serviceErrorResponse(c, error, 'today_deals');
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'OLIVEYOUNG_TODAY_DEALS_FAILED', message, 500);
  }
}
