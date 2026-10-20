import { ServiceError } from '../../core/errors.js';
import { fetchJson, fetchText, HttpError, UnexpectedHtmlResponseError } from '../../utils/http.js';
import { parseProductDetail, parseProductSearch, parseStoreSearch } from './parser.js';
import type { JapanProduct, JapanProductSearchResult, JapanStoreSearchResult } from './types.js';

const OPTIONS = { timeout: 20000, retries: 0 };

function validateSearch(query: string, page: number): string {
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 100) {
    throw new Error('검색어는 1~100자로 입력해주세요.');
  }
  if (!Number.isInteger(page) || page < 1 || page > 100) {
    throw new Error('페이지는 1~100의 정수여야 합니다.');
  }
  return query.trim();
}

async function upstream<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error instanceof SyntaxError || error instanceof UnexpectedHtmlResponseError) {
      throw new ServiceError(
        'DAISO_JP_PARSE_FAILED',
        '일본 다이소 원본 응답 형식이 변경되었습니다.',
        502,
        false,
      );
    }
    throw new ServiceError(
      'DAISO_JP_UPSTREAM_FAILED',
      '일본 다이소 공식 사이트에 연결할 수 없습니다.',
      503,
      true,
      error instanceof HttpError ? error.status : undefined,
    );
  }
}

export async function searchProducts(query: string, page = 1): Promise<JapanProductSearchResult> {
  const keyword = validateSearch(query, page);
  const url = new URL('https://jp.daisonet.com/search');
  url.search = new URLSearchParams({ q: keyword, type: 'product', page: String(page) }).toString();
  return upstream(async () => ({
    country: 'JP',
    currency: 'JPY',
    query: keyword,
    page,
    ...parseProductSearch(await fetchText(url.toString(), OPTIONS)),
    note: '일본 공식 온라인몰의 해당 검색 페이지입니다. 가격은 세금 포함 JPY이며, 온라인 판매 여부는 매장 재고가 아닙니다. 매장별 재고와 수량은 제공하지 않습니다.',
  }));
}

export async function getProduct(id: string): Promise<JapanProduct> {
  if (typeof id !== 'string' || !/^\d{13}$/.test(id)) {
    throw new Error('상품 ID는 13자리 숫자여야 합니다.');
  }
  return upstream(async () =>
    parseProductDetail(
      await fetchJson<unknown>(`https://jp.daisonet.com/products/${id}.js`, OPTIONS),
      id,
    ),
  );
}

export async function findStores(keyword: string, page = 1): Promise<JapanStoreSearchResult> {
  const query = validateSearch(keyword, page);
  const path = page === 1 ? '/shop/result' : `/shop/result/page/${page}/`;
  const url = new URL(path, 'https://www.daiso-sangyo.co.jp');
  url.search = new URLSearchParams({ keyword: query }).toString();
  return upstream(async () => ({
    country: 'JP',
    keyword: query,
    page,
    ...parseStoreSearch(await fetchText(url.toString(), OPTIONS)),
    note: '일본 공식 매장 검색의 키워드 일치 결과 중 해당 페이지입니다. 지역과 브랜드는 원본 결과를 따르며 DAISO 외 브랜드가 포함될 수 있습니다. 매장 재고는 제공하지 않습니다.',
  }));
}
