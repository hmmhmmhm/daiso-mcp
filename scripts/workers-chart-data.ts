import { buildKstDateRangeBetween, parseKstDateText } from './workers-chart-helpers.ts';

const WORKER_INVOCATIONS_QUERY = `
  query WorkerInvocations($accountTag: string, $scriptName: string, $start: Time!, $end: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(
          limit: 10000
          filter: { scriptName: $scriptName, datetime_geq: $start, datetime_lt: $end }
        ) {
          dimensions {
            datetime
          }
          sum {
            requests
          }
        }
      }
    }
  }
`;

/**
 * KST 날짜 범위를 하루 단위 조회 창으로 변환합니다.
 *
 * @param {string} startDateText
 * @param {string} endDateText
 * @returns {Array<{date: string, start: Date, end: Date}>}
 */
export function buildDailyWindows(startDateText, endDateText) {
  return buildKstDateRangeBetween(startDateText, endDateText).map((date) => {
    const start = parseKstDateText(date);
    return {
      date,
      start,
      end: new Date(start.getTime() + 86400000),
    };
  });
}

/**
 * Cloudflare GraphQL에서 특정 KST 하루의 호출량 합계를 조회합니다.
 *
 * adaptive 응답을 그대로 여러 날짜에 재버킷팅하지 않고,
 * 하루 범위를 개별 조회한 뒤 해당 창의 총합만 사용합니다.
 *
 * @param {object} params
 * @param {string} params.accountId
 * @param {string} params.apiToken
 * @param {string} params.scriptName
 * @param {Date} params.start
 * @param {Date} params.end
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<number>}
 */
export async function fetchWorkerInvocationsForWindow({
  accountId,
  apiToken,
  scriptName,
  start,
  end,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: WORKER_INVOCATIONS_QUERY,
      variables: {
        accountTag: accountId,
        scriptName,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare GraphQL 호출 실패: ${response.status} ${body}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Cloudflare GraphQL 오류: ${JSON.stringify(payload.errors)}`);
  }

  const rows = payload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!Array.isArray(rows)) {
    throw new Error('Cloudflare 응답에서 workersInvocationsAdaptive 데이터를 찾지 못했습니다.');
  }

  return rows.reduce((sum, row) => {
    const requests = Number(row?.sum?.requests ?? 0);
    return Number.isNaN(requests) ? sum : sum + requests;
  }, 0);
}

/**
 * KST 날짜 범위를 하루씩 고정 집계하여 반환합니다.
 *
 * @param {object} params
 * @param {string} params.accountId
 * @param {string} params.apiToken
 * @param {string} params.scriptName
 * @param {string} params.startDateText
 * @param {string} params.endDateText
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<Array<{date: string, requests: number}>>}
 */
export async function fetchDailyWorkerInvocations({
  accountId,
  apiToken,
  scriptName,
  startDateText,
  endDateText,
  fetchImpl = fetch,
}) {
  const points = [];

  for (const window of buildDailyWindows(startDateText, endDateText)) {
    const requests = await fetchWorkerInvocationsForWindow({
      accountId,
      apiToken,
      scriptName,
      start: window.start,
      end: window.end,
      fetchImpl,
    });
    points.push({
      date: window.date,
      requests,
    });
  }

  return points;
}
