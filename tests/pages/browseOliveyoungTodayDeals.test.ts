import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/oliveyoung/${name}`, import.meta.url), 'utf8');
const page = fixture('today-deals-page.html') + fixture('today-deals-coming-soon.html');
const list1 = fixture('today-deals-list-1.html');
const list3 = fixture('today-deals-list-3.html');
const origin = (url: string) =>
  new Response(
    url.includes('getHotdealList.do') ? page : url.includes('pageIdx=1') ? list1 : list3,
  );

afterEach(() => vi.unstubAllGlobals());

it('웹 조회 첫 화면에서 오특 결과로 가는 실제 링크를 제공한다', async () => {
  const html = await (await app.request('/browse/quick')).text();
  expect(html).toMatch(/href="\/browse\/read\/[0-9a-f-]{36}\/oliveyoung\/today-deals"/);
  expect(html).toContain('실시간 매장 재고가 아닙니다');
});

it('오특 웹 조회는 MCP와 같은 본문을 상품 카드와 원본 이미지로 보여준다', async () => {
  const fetcher = vi.fn(async (url: string) => origin(url));
  vi.stubGlobal('fetch', fetcher);
  const res = await app.request('/browse/oliveyoung/today-deals');
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/html');
  const html = await res.text();
  expect(html).toContain('조회 성공');
  expect(html).toContain(
    '<h2>[10월올영픽] 어노브 실크 헤어 오일 에센스 70ml 더블 기획 (텐더블룸/웜페탈)</h2>',
  );
  expect(html).toContain('<h2>VT 피디알엔 리들샷 마이크로 포어 패치 4매</h2>');
  expect(html).toContain('A00000026357916ko.jpg');
  expect(html).toContain('upcomingDeals');
  // 페이지 1번과 목록 2페이지만 원본에 요청합니다.
  expect(fetcher).toHaveBeenCalledTimes(3);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => origin(url)),
  );
  const raw = await app.request('/api/oliveyoung/today-deals');
  expect(raw.headers.get('Content-Type')).toContain('application/json');
  const { data } = await raw.json();
  expect(data).toMatchObject({
    brandDealCount: 4,
    todayDealCount: 17,
    upcomingDealCount: 3,
    truncated: false,
  });
  expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(data.upcomingDeals[0]).toEqual({
    goodsNo: 'A000000202414',
    name: '[10월 올영픽/몬치치] 라보에이치 헤어라인앰플 더블기획(+샴푸50ML)',
    imageUrl: expect.stringContaining('A00000020241475ko.jpg'),
    productUrl: expect.stringContaining('goodsNo=A000000202414'),
  });
});

it.each([
  // 브랜드 특가 섹션 이름이 바뀐 실제 오특 페이지
  [page.replaceAll('_스페셜', '_변경됨'), 502, 'OLIVEYOUNG_TODAY_DEALS_PARSE_FAILED'],
  // 오특이 아닌 페이지는 직접 요청 단계에서 거절합니다.
  ['<div>원본 구조 변경</div>', 500, '올리브영 직접 요청 실패'],
])(
  '원본 형식이 바뀌면 웹 조회도 빈 목록이 아니라 조회 실패로 보여준다',
  async (html, status, text) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html)),
    );
    const res = await app.request('/browse/oliveyoung/today-deals');
    expect(res.status).toBe(status);
    const body = await res.text();
    expect(body).toContain('조회 실패');
    expect(body).toContain(text);
    expect(body).not.toContain('빈 목록');
  },
);
