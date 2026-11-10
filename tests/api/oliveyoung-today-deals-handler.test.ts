import { beforeEach, expect, it, vi } from 'vitest';
import { ServiceError } from '../../src/core/errors.js';

const fetchOliveyoungTodayDeals = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/oliveyoung/todayDeals.js', () => ({ fetchOliveyoungTodayDeals }));
const { handleOliveyoungGetTodayDeals } =
  await import('../../src/api/oliveyoungTodayDealsHandler.js');

const context = (query: Record<string, string> = {}, env: Record<string, string> = {}) => {
  const json = vi.fn((body: unknown, status = 200) => ({ body, status }));
  return {
    c: {
      env,
      req: {
        query: (name: string) => query[name],
        header: () => undefined,
        raw: new Request('http://x'),
      },
      json,
      header: vi.fn(),
    } as never,
    json,
  };
};

beforeEach(() => {
  fetchOliveyoungTodayDeals.mockReset();
  fetchOliveyoungTodayDeals.mockResolvedValue({
    date: '2026-11-02',
    brandDeals: [],
    todayDeals: [],
    truncated: false,
    upcomingDeals: null,
  });
});

it('중계 설정과 제한 시간을 전달하고 MCP와 같은 본문을 반환한다', async () => {
  const relay = { OY_RELAY_URL: 'https://relay.example', OY_RELAY_TOKEN: 't' };
  const { c, json } = context({}, relay);
  await handleOliveyoungGetTodayDeals(c);
  expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith(
    expect.objectContaining({ relayUrl: relay.OY_RELAY_URL, relayToken: 't', timeout: 60000 }),
  );
  expect(json.mock.calls[0][0]).toMatchObject({
    success: true,
    data: { date: '2026-11-02', upcomingDealCount: null, upcomingDeals: null },
  });
  await handleOliveyoungGetTodayDeals(context({ timeoutMs: '9000' }).c);
  expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeout: 9000 }),
  );
  await handleOliveyoungGetTodayDeals(context({ timeoutMs: 'bad' }).c);
  expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeout: 15000 }),
  );
});

it.each([
  [
    new ServiceError('OLIVEYOUNG_TODAY_DEALS_PARSE_FAILED', '형식 변경', 502, false),
    502,
    'OLIVEYOUNG_TODAY_DEALS_PARSE_FAILED',
  ],
  [new Error('올리브영 직접 요청 실패'), 500, 'OLIVEYOUNG_TODAY_DEALS_FAILED'],
  ['unknown', 500, 'OLIVEYOUNG_TODAY_DEALS_FAILED'],
])('실패를 빈 목록 대신 오류로 반환한다: %s', async (failure, status, code) => {
  fetchOliveyoungTodayDeals.mockRejectedValue(failure);
  const { c, json } = context();
  await handleOliveyoungGetTodayDeals(c);
  expect(json.mock.calls[0][1]).toBe(status);
  expect(json.mock.calls[0][0]).toMatchObject({ success: false, error: { code } });
});
