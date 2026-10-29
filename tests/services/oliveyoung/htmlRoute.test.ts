import { describe, expect, it } from 'vitest';
import { OLIVEYOUNG_API } from '../../../src/services/oliveyoung/api.js';
import {
  buildOliveyoungHtmlPath,
  isOliveyoungHtmlPath,
  oliveyoungHtmlOperation,
  toOliveyoungHtmlResponse,
} from '../../../src/services/oliveyoung/htmlRoute.js';

const PAGE = OLIVEYOUNG_API.TODAY_DEALS_PAGE_PATH;
const LIST = OLIVEYOUNG_API.TODAY_DEALS_LIST_PATH;

describe('오특 HTML 조회 계약', () => {
  it('고정 경로와 중계 작업 이름만 인식한다', () => {
    expect(isOliveyoungHtmlPath(PAGE)).toBe(true);
    expect(isOliveyoungHtmlPath(OLIVEYOUNG_API.PRODUCT_SEARCH_PATH)).toBe(false);
    expect(oliveyoungHtmlOperation(LIST)).toBe('today-deals-list');
    expect(oliveyoungHtmlOperation('/p')).toBeUndefined();
  });
  it('페이지는 날짜를 주소에 붙이지 않고 목록은 고정 정렬 조건을 붙인다', () => {
    expect(buildOliveyoungHtmlPath(PAGE, { date: '20261026' })).toBe(PAGE);
    expect(buildOliveyoungHtmlPath(LIST, { pageIdx: 2, date: '20261026' })).toBe(
      `${LIST}?date=20261026&pageIdx=2&fltCondition=02&fltDispCatNo=&prdSort=rank`,
    );
  });
  it.each([
    [PAGE, {}],
    [PAGE, { date: '2026-10-26' }],
    [PAGE, { date: '20261026', pageIdx: 1 }],
    [LIST, { date: '20261026' }],
    [LIST, { date: '20261026', pageIdx: '1' }],
    [LIST, { date: '20261026', pageIdx: 1.5 }],
    [LIST, { date: '20261026', pageIdx: 0 }],
    [LIST, { date: '20261026', pageIdx: 21 }],
    [LIST, { date: '20261026', pageIdx: 1, extra: 'x' }],
    [OLIVEYOUNG_API.PRODUCT_SEARCH_PATH, { date: '20261026', pageIdx: 1 }],
  ])('계약 밖 요청 %s %j는 주소를 만들지 않는다', (path, body) => {
    expect(() => buildOliveyoungHtmlPath(path, body)).toThrow('형식 오류');
  });
  it('정상 오특 HTML만 성공 응답으로 감싼다', () => {
    const page = '<div class="today_specials_inner"></div>';
    expect(toOliveyoungHtmlResponse(PAGE, page)).toEqual({
      status: 'SUCCESS',
      data: { html: page },
    });
    expect(toOliveyoungHtmlResponse(LIST, '\n ')).toMatchObject({ status: 'SUCCESS' });
    expect(toOliveyoungHtmlResponse(LIST, '<li data-impression="x">')).toMatchObject({
      status: 'SUCCESS',
    });
    for (const [path, html] of [
      [PAGE, '<div>다른 페이지</div>'],
      [PAGE, `${page}<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=1&_cf_chl_opt=1"></script>`],
      [LIST, '<div>x</div>'],
      [LIST, '잠시만 기다려 주세요'],
      [LIST, null],
    ] as const) {
      expect(() => toOliveyoungHtmlResponse(path, html)).toThrow('응답 형식 오류');
    }
  });
});
