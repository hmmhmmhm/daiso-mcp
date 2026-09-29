/** 핸들러가 읽는 query만 캐시 키에 포함하고 동일한 기본값을 합칩니다. */
const product = { keyword: '', page: '1', size: '20', sort: '01', includeSoldOut: 'false' };
const location = { lat: '37.5665', lng: '126.978' };
const defaults: Record<string, Record<string, string>> = {
  '/api/oliveyoung/products': product,
  '/api/oliveyoung/stores': { keyword: '', ...location, pageIdx: '1', limit: '20' },
  '/api/oliveyoung/inventory': {
    ...product,
    ...location,
    storeKeyword: '',
    storeLimit: '10',
    stockCheckLimit: '5',
  },
};
export function oliveyoungCacheKey(input: string): string {
  const url = new URL(input);
  const values = defaults[url.pathname];
  if (!values) return input;
  const key = new URL(url.origin + url.pathname);
  for (const [name, fallback] of Object.entries({ ...values, timeoutMs: '15000' })) {
    key.searchParams.set(name, url.searchParams.get(name) || fallback);
  }
  const fresh = url.searchParams.get('_healthCheck');
  if (fresh !== null) key.searchParams.set('_healthCheck', fresh);
  return key.toString();
}
