import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  compareUpcoming,
  createUpcomingSnapshot,
  fetchTodayDeals,
  kstDate,
  type TodayDealsBody,
} from '../../scripts/ops/oliveyoung-coming-soon-check.js';

// 한국 시간 2026-11-03 21:10
const evening = Date.parse('2026-11-03T12:10:00Z');
const deal = (goodsNo: string) => ({ goodsNo, name: `상품 ${goodsNo}` });
const body = (patch: Partial<TodayDealsBody> = {}): TodayDealsBody => ({
  date: '2026-11-03',
  truncated: false,
  brandDeals: [deal('A000000000001')],
  todayDeals: [deal('A000000000002')],
  upcomingDeals: [deal('A000000000003'), deal('A000000000004')],
  ...patch,
});

describe('coming soon 예고 저장', () => {
  it('21시 이후 오늘 응답의 예고를 다음 날 대조용으로 저장한다', () => {
    expect(kstDate(Date.parse('2026-11-03T15:30:00Z'))).toBe('2026-11-04');
    expect(createUpcomingSnapshot(body(), evening)).toEqual({
      checkedAt: '2026-11-03T12:10:00.000Z',
      sourceDate: '2026-11-03',
      targetDate: '2026-11-04',
      upcomingDeals: body().upcomingDeals,
    });
  });

  it.each([
    [body(), Date.parse('2026-11-03T11:59:00Z'), '공개 전'],
    [body({ date: '2026-11-02' }), evening, '오늘이 아닙니다'],
    [body({ upcomingDeals: null }), evening, 'upcomingDeals=null'],
    [body({ upcomingDeals: [] }), evening, '예고 상품이 없습니다'],
  ])('확인할 수 없는 예고는 저장하지 않고 실패한다: %#', (input, now, message) => {
    expect(() => createUpcomingSnapshot(input, now)).toThrow(message);
  });
});

describe('다음 날 오특 대조', () => {
  const snapshot = createUpcomingSnapshot(body(), evening);
  const next = (patch: Partial<TodayDealsBody> = {}) =>
    body({
      date: '2026-11-04',
      brandDeals: [deal('A000000000003')],
      todayDeals: [deal('A000000000004')],
      upcomingDeals: null,
      ...patch,
    });

  it('잘린 실제 목록은 완전한 대조로 판단하지 않는다', () => {
    expect(() => compareUpcoming(snapshot, next({ truncated: true }))).toThrow('목록이 잘려');
  });

  it('예고 상품번호가 실제 오특과 모두 같으면 통과한다', () => {
    expect(compareUpcoming(snapshot, next())).toEqual({
      ok: true,
      targetDate: '2026-11-04',
      previewCount: 2,
      dealCount: 2,
      matched: 2,
      notInDeals: [],
      notInPreview: [],
    });
  });

  it('빠지거나 추가된 상품과 상품번호 없는 예고를 불일치로 보고한다', () => {
    const withMissingNo = {
      ...snapshot,
      upcomingDeals: [...snapshot.upcomingDeals, { goodsNo: null, name: '번호 없음' }],
    };
    const result = compareUpcoming(withMissingNo, next({ todayDeals: [deal('A000000000009')] }));
    expect(result).toMatchObject({ ok: false, matched: 1, previewCount: 3, dealCount: 2 });
    expect(result.notInDeals.map((d) => d.name)).toEqual(['상품 A000000000004', '번호 없음']);
    expect(result.notInPreview).toEqual([deal('A000000000009')]);
  });

  it('대상 날짜가 아닌 오특과는 대조하지 않는다', () => {
    expect(() => compareUpcoming(snapshot, next({ date: '2026-11-05' }))).toThrow('대조 날짜');
  });
});

describe('운영 오특 조회', () => {
  it('성공 응답의 본문을 반환한다', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true, data: body() }));
    await expect(fetchTodayDeals('https://mcp.example', fetchImpl)).resolves.toEqual(body());
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://mcp.example/api/oliveyoung/today-deals',
    );
  });

  it.each([
    [
      Response.json(
        {
          success: false,
          error: { code: 'OLIVEYOUNG_TODAY_DEALS_PARSE_FAILED', message: '형식 변경' },
        },
        { status: 502 },
      ),
      'HTTP 502, OLIVEYOUNG_TODAY_DEALS_PARSE_FAILED: 형식 변경',
    ],
    [new Response('<html>', { status: 200 }), 'HTTP 200, 본문 없음'],
  ])('실패 응답은 오류로 바꾼다: %#', async (response, message) => {
    await expect(fetchTodayDeals('https://mcp.example', async () => response)).rejects.toThrow(
      message,
    );
  });
});

it('workflow는 21시 이후 저장하고 자정 이후 대조한다', () => {
  const workflow = readFileSync('.github/workflows/oliveyoung-coming-soon.yml', 'utf8');
  expect(workflow).toContain("cron: '10 12 * * *'");
  expect(workflow).toContain("cron: '20 15 * * *'");
  expect(workflow).toContain('oliveyoung-coming-soon.ts snapshot coming-soon.json');
  expect(workflow).toContain('oliveyoung-coming-soon.ts compare coming-soon.json');
});
