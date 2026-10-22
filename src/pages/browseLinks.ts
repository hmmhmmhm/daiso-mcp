/** API가 명시한 페이지 정보만 사용해 검색 조건을 보존합니다. */
import { toBrowsePath } from './browsePaths.js';
const PAGE_ROUTES = new Set([
  '/api/daiso/products',
  '/api/daiso/inventory',
  '/api/daiso-jp/products',
  '/api/daiso-jp/stores',
  '/api/seveneleven/products',
  '/api/emart24/products',
  '/api/emart24/stores',
  '/api/oliveyoung/products',
  '/api/oliveyoung/inventory',
]);

export function browsePageLinks(source: URL, body: unknown): { label: string; path: string }[] {
  if (!body || typeof body !== 'object' || !PAGE_ROUTES.has(source.pathname)) return [];
  const result = body as {
    success?: boolean;
    meta?: { page?: number; pageSize?: number; total?: number };
    data?: { hasNext?: boolean; nextPage?: number };
  };
  if (result.success === false) return [];
  const page = Number(source.searchParams.get('page') ?? result.meta?.page ?? 1);
  const size = Number(
    source.searchParams.get('pageSize') ??
      source.searchParams.get('size') ??
      result.meta?.pageSize ??
      0,
  );
  const maxPage = source.pathname.startsWith('/api/daiso-jp/') ? 100 : Number.MAX_SAFE_INTEGER - 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > maxPage) return [];
  const links: { label: string; path: string }[] = [];
  const add = (label: string, next: number) => {
    const target = new URL(source);
    target.searchParams.set('page', String(next));
    links.push({ label, path: toBrowsePath(target)! });
  };
  if (page > 1) add('이전 페이지', page - 1);
  const nextPage = result.data?.nextPage;
  if (
    typeof nextPage === 'number' &&
    Number.isSafeInteger(nextPage) &&
    nextPage > page &&
    nextPage <= maxPage
  ) {
    add('다음 페이지', nextPage);
  } else if (
    page < maxPage &&
    (result.data?.hasNext === true ||
      (Number.isSafeInteger(size) &&
        size > 0 &&
        typeof result.meta?.total === 'number' &&
        result.data?.hasNext !== false &&
        page * size < result.meta.total))
  ) {
    add('다음 페이지', page + 1);
  }
  return links;
}
