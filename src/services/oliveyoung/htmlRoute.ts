/**
 * 올리브영 오특 HTML 조회 계약
 *
 * 직접 조회와 브라우저 중계가 같은 고정 경로, 인수 검증, 응답 판정을 사용합니다.
 */

import { OLIVEYOUNG_API } from './api.js';
import type { OliveyoungApiResponse } from './types.js';

/** 중계 작업 이름과 공식 경로입니다. */
export const OLIVEYOUNG_HTML_OPERATIONS = {
  'today-deals-page': OLIVEYOUNG_API.TODAY_DEALS_PAGE_PATH,
  'today-deals-list': OLIVEYOUNG_API.TODAY_DEALS_LIST_PATH,
} as const;

export const OLIVEYOUNG_TODAY_DEALS_MAX_PAGE = 20;

// 정상 페이지에는 없는 Cloudflare 보안 확인 화면의 표시입니다.
const CHALLENGE_PATTERN = /_cf_chl|잠시만 기다려/;

export function isOliveyoungHtmlPath(path: string): boolean {
  return Object.values<string>(OLIVEYOUNG_HTML_OPERATIONS).includes(path);
}

/** 공식 경로에 대응하는 중계 작업 이름입니다. HTML 경로가 아니면 undefined입니다. */
export function oliveyoungHtmlOperation(path: string): string | undefined {
  return Object.entries(OLIVEYOUNG_HTML_OPERATIONS).find(([, value]) => value === path)?.[0];
}

/**
 * 허용한 날짜와 페이지만 조회 주소에 넣습니다.
 * 오특 페이지의 날짜는 자정 전후 캐시를 구분하는 용도이며 주소에는 붙이지 않습니다.
 *
 * @throws {Error} 경로나 인수가 계약과 다를 때
 */
export function buildOliveyoungHtmlPath(path: string, body: Record<string, unknown>): string {
  const { date, pageIdx } = body;
  const keys = Object.keys(body).sort().join(',');
  if (typeof date !== 'string' || !/^\d{8}$/.test(date)) {
    throw new Error('올리브영 오특 날짜 형식 오류');
  }
  if (path === OLIVEYOUNG_API.TODAY_DEALS_PAGE_PATH && keys === 'date') return path;
  if (
    path !== OLIVEYOUNG_API.TODAY_DEALS_LIST_PATH ||
    keys !== 'date,pageIdx' ||
    typeof pageIdx !== 'number' ||
    !Number.isInteger(pageIdx) ||
    pageIdx < 1 ||
    pageIdx > OLIVEYOUNG_TODAY_DEALS_MAX_PAGE
  ) {
    throw new Error('올리브영 오특 요청 형식 오류');
  }
  const query = new URLSearchParams({
    date,
    pageIdx: String(pageIdx),
    fltCondition: '02',
    fltDispCatNo: '',
    prdSort: 'rank',
  });
  return `${path}?${query}`;
}

/**
 * 정상 오특 HTML만 성공 응답으로 감쌉니다.
 * 보안 확인 화면이나 다른 페이지를 빈 목록으로 바꾸지 않습니다.
 *
 * @throws {Error} 오특 HTML이 아닐 때
 */
export function toOliveyoungHtmlResponse(path: string, html: unknown): OliveyoungApiResponse {
  const valid =
    typeof html === 'string' &&
    !CHALLENGE_PATTERN.test(html) &&
    (path === OLIVEYOUNG_API.TODAY_DEALS_PAGE_PATH
      ? html.includes('today_specials_inner')
      : html.includes('<li data-impression') || html.trim() === '');
  if (!valid) throw new Error('올리브영 오특 응답 형식 오류');
  return { status: 'SUCCESS', data: { html } };
}
