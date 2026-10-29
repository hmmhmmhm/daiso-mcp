/**
 * 올리브영 오특 조회 도구 테스트
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

const fetchOliveyoungTodayDeals = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/services/oliveyoung/todayDeals.js', () => ({
  fetchOliveyoungTodayDeals,
}));
const { createGetTodayDealsTool } = await import(
  '../../../../src/services/oliveyoung/tools/getTodayDeals.js'
);

const deal = {
  rank: 1,
  goodsNo: 'A000000171422',
  name: '어노브 실크 헤어 오일',
  brand: '어노브',
  category: '헤어용품',
  price: 27200,
  priceFrom: true,
  originalPrice: 35000,
  discountRate: 22,
  flags: ['세일'],
  todayDelivery: true,
  soldOut: false,
  imageUrl: 'https://image.oliveyoung.co.kr/a.jpg',
  productUrl: 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000171422',
};

beforeEach(() => {
  fetchOliveyoungTodayDeals.mockReset();
  fetchOliveyoungTodayDeals.mockResolvedValue({
    date: '2026-10-26',
    brandDeals: [deal],
    todayDeals: [deal, { ...deal, rank: 2 }],
    truncated: false,
  });
});

describe('createGetTodayDealsTool', () => {
  it('브랜드 특가와 오늘의 특가를 개수와 함께 반환한다', async () => {
    const tool = createGetTodayDealsTool();
    expect(tool.name).toBe('oliveyoung_get_today_deals');
    const args = z.object(tool.metadata.inputSchema).parse({});
    const result = await tool.handler(args);
    const body = JSON.parse(result.content[0].text);
    expect(body).toMatchObject({
      date: '2026-10-26',
      brandDealCount: 1,
      todayDealCount: 2,
      truncated: false,
      brandDeals: [deal],
    });
    expect(body.note).toContain('check_inventory');
    expect(result.structuredContent).toEqual(body);
    expect(z.object(tool.metadata.outputSchema!).parse(body)).toEqual(body);
    expect(fetchOliveyoungTodayDeals).toHaveBeenCalledWith({ timeout: 15000 });
  });
  it('릴레이 설정과 제한 시간을 전달한다', async () => {
    const transport = { relayUrl: 'https://relay.example', relayToken: 'test' };
    const tool = createGetTodayDealsTool(transport);
    await tool.handler(z.object(tool.metadata.inputSchema).parse({}));
    expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith({ ...transport, timeout: 60000 });
    await tool.handler({});
    expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith({ ...transport, timeout: 60000 });
    await tool.handler({ timeoutMs: 30000 });
    expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith({ ...transport, timeout: 30000 });
    await createGetTodayDealsTool({ timeout: 9000 }).handler({});
    expect(fetchOliveyoungTodayDeals).toHaveBeenLastCalledWith({ timeout: 9000 });
  });
  it('원본 실패를 빈 목록으로 바꾸지 않는다', async () => {
    fetchOliveyoungTodayDeals.mockRejectedValue(new Error('올리브영 직접 요청 실패'));
    await expect(createGetTodayDealsTool().handler({})).rejects.toThrow('직접 요청 실패');
  });
});
