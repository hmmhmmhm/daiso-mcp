import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOliveyoungTodayDeals,
  parseOliveyoungTodayDeals,
  toKstDate,
} from '../../../src/services/oliveyoung/todayDeals.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/oliveyoung/${name}`, import.meta.url), 'utf8');
const page = fixture('today-deals-page.html');
const list1 = fixture('today-deals-list-1.html');
const list3 = fixture('today-deals-list-3.html');
// 2026-10-27 화면에 일시품절로 표시된 실제 카드
const soldOutCard = fixture('today-deals-list-soldout.html');
// 2026-10-26 10:00 KST
const now = new Date('2026-10-26T01:00:00Z');
const card = (goodsNo: string, rank: number, extra = '') =>
  `<li data-impression="${goodsNo}^오특_오특상품리스트_인기순^${rank}"><a data-ref-goodsNo="${goodsNo}"><span class="prod-name">상품 ${rank}</span><div class="price"><strong class="total">1,000<span class="won">원</span></strong></div>${extra}</a></li>`;

afterEach(() => vi.unstubAllGlobals());

describe('오특 HTML 파싱', () => {
  it('브랜드 특가 카드를 가격·할인·혜택과 함께 읽는다', () => {
    const deals = parseOliveyoungTodayDeals(page, '스페셜');
    expect(deals).toHaveLength(4);
    expect(deals[0]).toEqual({
      rank: 1,
      goodsNo: 'A000000171422',
      name: '[10월올영픽] 어노브 실크 헤어 오일 에센스 70ml 더블 기획 (텐더블룸/웜페탈)',
      brand: '어노브',
      category: '헤어용품>헤어 트리트먼트>헤어에센스',
      price: 27200,
      priceFrom: true,
      originalPrice: 35000,
      discountRate: 22,
      flags: ['세일', '쿠폰', '증정'],
      todayDelivery: true,
      soldOut: false,
      imageUrl: expect.stringContaining('A00000017142291ko.jpg'),
      productUrl:
        'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000171422',
    });
    expect(parseOliveyoungTodayDeals(page, '인기순')).toEqual([]);
  });
  it('오늘의 특가 목록에서 단일가와 오늘드림 미제공 상품을 구분한다', () => {
    const deals = parseOliveyoungTodayDeals(list3);
    expect(deals.map((d) => d.rank)).toEqual([21, 22, 23, 24, 25, 26, 27]);
    expect(deals[4]).toMatchObject({
      goodsNo: 'B000000265402',
      price: 99000,
      priceFrom: false,
      originalPrice: 129000,
      todayDelivery: false,
      flags: ['쿠폰'],
    });
    expect(parseOliveyoungTodayDeals(list1)[3].flags).toEqual(['1+1', '쿠폰', '증정']);
  });
  it('일시품절 표시를 다른 값과 함께 읽는다', () => {
    expect(parseOliveyoungTodayDeals(soldOutCard)).toEqual([
      expect.objectContaining({
        rank: 27,
        goodsNo: 'A000000263126',
        name: '[온라인 단독]올더베러 엑스트라버진 올리브오일 캡슐(30일분 x 4개입)',
        price: 49900,
        originalPrice: 79900,
        discountRate: 37,
        todayDelivery: true,
        soldOut: true,
      }),
    ]);
    const others = [...parseOliveyoungTodayDeals(page, '스페셜'), ...parseOliveyoungTodayDeals(list1)];
    expect(others.some((d) => d.soldOut)).toBe(false);
  });
  it('정가와 할인율이 없는 카드와 HTML 문자 참조를 처리한다', () => {
    const [deal] = parseOliveyoungTodayDeals(
      card('A000000000001', 1).replace('상품 1', 'A&amp;B &#39;C&#x27; &nbsp;D &copy; &#99999999;'),
    );
    expect(deal).toMatchObject({
      name: "A&B 'C' D &copy; &#99999999;",
      brand: '',
      category: '',
      originalPrice: null,
      discountRate: null,
      flags: [],
      imageUrl: '',
    });
    const [plain] = parseOliveyoungTodayDeals(
      card('A000000000001', 1).replace('<div class="price">', '<div>'),
    );
    expect(plain).toMatchObject({ price: 1000, originalPrice: null, todayDelivery: false });
  });
  it.each([
    ['상품번호', card('A000000000001', 1).replaceAll('A000000000001"', 'bad"')],
    ['상품명', card('A000000000001', 1).replace('상품 1', ' ')],
    ['상품명 요소', card('A000000000001', 1).replace('class="prod-name"', 'class="x"')],
    ['가격', card('A000000000001', 1).replace('1,000', '')],
    ['순위', card('A000000000001', 1).replace('^1"', '^x"')],
  ])('%s이 없는 카드는 형식 변경 오류로 거절한다', (_name, html) => {
    expect(() => parseOliveyoungTodayDeals(html)).toThrow('형식이 변경');
  });
  it('한국 자정을 기준으로 날짜를 계산한다', () => {
    expect(toKstDate(new Date('2026-10-25T14:59:59Z'))).toBe('20261025');
    expect(toKstDate(new Date('2026-10-25T15:00:00Z'))).toBe('20261026');
  });
});

describe('오특 조회', () => {
  it('페이지와 목록을 직접 GET으로 읽고 마지막 페이지에서 멈춘다', async () => {
    const fetch = vi.fn(async (url: string) =>
      new Response(url.includes('getHotdealList.do') ? page : url.includes('pageIdx=1') ? list1 : list3),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await fetchOliveyoungTodayDeals({}, now);
    expect(result).toMatchObject({ date: '2026-10-26', truncated: false });
    expect(result.brandDeals).toHaveLength(4);
    expect(result.todayDeals).toHaveLength(17);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://www.oliveyoung.co.kr/store/main/getHotdealList.do',
      'https://www.oliveyoung.co.kr/store/main/getHotdealPagingListAjax.do?date=20261026&pageIdx=1&fltCondition=02&fltDispCatNo=&prdSort=rank',
      'https://www.oliveyoung.co.kr/store/main/getHotdealPagingListAjax.do?date=20261026&pageIdx=2&fltCondition=02&fltDispCatNo=&prdSort=rank',
    ]);
    const init = fetch.mock.calls[0][1] as unknown as RequestInit;
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(init.headers).toMatchObject({ Accept: 'text/html' });
    expect(init.headers).not.toHaveProperty('Content-Type');
  });
  it('빈 목록 페이지에서 끝내고 중복 상품은 한 번만 반환한다', async () => {
    const full = Array.from({ length: 10 }, (_, i) => card(`A0000000000${10 + i}`, i + 1)).join('');
    const pages = [page, full, full, '\n  \n'];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(pages.shift())));
    const result = await fetchOliveyoungTodayDeals({}, now);
    expect(result.todayDeals).toHaveLength(10);
    expect(pages).toHaveLength(0);
  });
  it('최대 페이지가 모두 가득 차면 잘림을 알린다', async () => {
    let index = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('getHotdealList.do')) return new Response(page);
        return new Response(
          Array.from({ length: 10 }, () => card(`A${String(++index).padStart(12, '0')}`, index)).join(''),
        );
      }),
    );
    const result = await fetchOliveyoungTodayDeals({}, now);
    expect(result.truncated).toBe(true);
    expect(result.todayDeals).toHaveLength(200);
  });
  it('보안 확인 화면, 다른 페이지, HTTP201은 빈 목록이 아니라 실패로 반환한다', async () => {
    for (const response of [
      new Response('<title>잠시만 기다리십시오…</title>', { status: 403 }),
      new Response('<html>잠시만 기다려 주세요</html>'),
      new Response('<html>다른 페이지</html>'),
      new Response(page, { status: 201 }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(fetchOliveyoungTodayDeals({}, now)).rejects.toThrow('직접 요청 실패');
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(url.includes('getHotdealList.do') ? page : '<div>x</div>')),
    );
    await expect(fetchOliveyoungTodayDeals({}, now)).rejects.toThrow('직접 요청 실패');
  });
  it('릴레이에는 고정 작업 이름과 날짜·페이지만 전달한다', async () => {
    const fetch = vi.fn(async (url: string) =>
      Response.json({
        status: 'SUCCESS',
        data: { html: url.endsWith('today-deals-page') ? page : list3 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await fetchOliveyoungTodayDeals(
      { relayUrl: 'https://relay.example/', relayToken: 'test' },
      now,
    );
    expect(result.todayDeals).toHaveLength(7);
    expect(fetch.mock.calls.map(([url, init]) => [url, (init as RequestInit).body])).toEqual([
      ['https://relay.example/v1/oliveyoung/today-deals-page', '{"date":"20261026"}'],
      ['https://relay.example/v1/oliveyoung/today-deals-list', '{"date":"20261026","pageIdx":1}'],
    ]);
  });
  it('릴레이 성공 응답에 HTML이 없으면 형식 오류로 거절한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'SUCCESS', data: {} })));
    await expect(
      fetchOliveyoungTodayDeals({ relayUrl: 'https://relay.example', relayToken: 'test' }, now),
    ).rejects.toThrow('형식이 변경');
  });
  it('여러 페이지를 합친 전체 제한 시간을 넘기면 다음 요청을 보내지 않는다', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetch = vi.fn(async () => {
      clock.mockReturnValue(7000);
      return new Response(page);
    });
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(fetchOliveyoungTodayDeals({ timeout: 5000 }, now)).rejects.toThrow('시간 초과');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
});
