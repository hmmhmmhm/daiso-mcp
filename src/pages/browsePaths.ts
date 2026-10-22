/** 공개 읽기 API와 쿼리 없는 웹 경로의 가역 변환입니다. */
import { ACTION_QUERY_DEFINITIONS } from '../api/actionsProxy.js';

interface BrowseRoute {
  api: string;
  path: string;
  title: string;
  positional: string[];
  detail: boolean;
}

function positionalKeys(path: string): string[] {
  if (path.endsWith('/:productId')) return ['productId'];
  if (path === '/api/daiso/inventory') return ['productId', 'keyword'];
  if (path === '/api/daiso/display-location') return ['productId', 'storeCode'];
  if (path.endsWith('/inventory')) return ['keyword', 'storeKeyword'];
  if (path.endsWith('/products')) {
    if (/\/daiso(?:-jp)?\//.test(path)) return ['q'];
    return [path.includes('/seveneleven/') ? 'query' : 'keyword'];
  }
  if (path.endsWith('/stores') || path.endsWith('/theaters')) return ['keyword'];
  if (path.endsWith('/popwords')) return ['label'];
  if (path === '/api/places/search') return ['location', 'keyword'];
  if (path === '/api/opinet/station') return ['id'];
  return [];
}

export const BROWSE_ROUTES: readonly BrowseRoute[] = ACTION_QUERY_DEFINITIONS.filter(
  (def) => def.action !== 'submitDeveloperRequest',
).map((def) => ({
  api: def.targetPath,
  path: def.targetPath.replace('/api/', '/browse/').replace('/products/:productId', '/product'),
  title: def.summary,
  positional: positionalKeys(def.targetPath),
  detail: def.pathParam !== undefined,
}));

/** URL 표준이 점 세그먼트와 빈 값을 삭제하지 않도록 구분합니다. */
function encodeSegment(value: string): string {
  return ['', '.', '..'].includes(value)
    ? '~' + value
    : encodeURIComponent(value).replaceAll('~', '%7E');
}
function decodeSegment(value: string): string {
  const decoded = ['~', '~.', '~..'].includes(value) ? value.slice(1) : decodeURIComponent(value);
  if (decoded.length > 1024 || /[\p{Cc}]/u.test(decoded)) throw new Error('잘못된 경로 값입니다.');
  return decoded;
}

/** JSON 및 구형 HTML URL을 검색 조건이 같은 browse 경로로 변환합니다. */
export function toBrowsePath(source: URL): string | null {
  const route = BROWSE_ROUTES.find((r) =>
    r.detail
      ? source.pathname.startsWith(r.api.replace('/:productId', '/')) &&
        source.pathname.slice(r.api.indexOf('/:productId') + 1).length > 0 &&
        !source.pathname.slice(r.api.indexOf('/:productId') + 1).includes('/')
      : r.api === source.pathname,
  );
  if (!route) return null;
  const params = new URLSearchParams(source.search);
  for (const key of [...params.keys()]) {
    if (key === 'format' || key === 'guide' || key.startsWith('utm_')) params.delete(key);
  }
  if (route.detail) {
    try {
      params.set(
        'productId',
        decodeURIComponent(source.pathname.slice(source.pathname.lastIndexOf('/') + 1)),
      );
    } catch {
      return null;
    }
  }
  const parts: string[] = [];
  const primary = route.positional[0];
  const friendly = primary !== undefined && params.has(primary);
  if (friendly) {
    for (const key of route.positional) {
      if (!params.has(key)) break;
      parts.push(encodeSegment(params.get(key)!));
      params.delete(key);
    }
  }
  for (const [key, value] of params) parts.push(encodeSegment(key), encodeSegment(value));
  const base =
    friendly || params.size === 0 || route.positional.length === 0
      ? route.path
      : route.path.replace('/browse/', '/browse/query/');
  return base + (parts.length ? '/' + parts.join('/') : '');
}

/** 임의의 목적지를 받지 않고 등록된 공개 GET만 변환합니다. */
export function browseApiUrl(source: URL): URL | null {
  if (source.pathname.length > 8192) throw new Error('조회 경로가 너무 깁니다.');
  for (const key of source.searchParams.keys()) {
    if (!key.startsWith('utm_') && !['guide', 'format', 'gclid', 'fbclid'].includes(key)) {
      throw new Error('조회 조건은 쿼리 대신 경로에 넣어주세요.');
    }
  }
  const generic = source.pathname.startsWith('/browse/query/');
  const path = generic ? source.pathname.replace('/browse/query/', '/browse/') : source.pathname;
  const route = [...BROWSE_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((r) => path === r.path || path.startsWith(r.path + '/'));
  if (!route) return null;
  const tail = path.slice(route.path.length);
  const values = tail ? tail.slice(1).split('/').map(decodeSegment) : [];
  const params = new URLSearchParams();
  if (!generic && values.length && route.positional.length) {
    params.set(route.positional[0], values.shift()!);
    if (route.positional.length === 2 && values.length % 2 === 1)
      params.set(route.positional[1], values.shift()!);
  }
  if (values.length % 2 !== 0) throw new Error('조건 이름과 값을 한 쌍으로 입력해주세요.');
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i];
    if (
      !/^[A-Za-z][A-Za-z0-9]*$/.test(key) ||
      ['format', 'guide', 'action'].includes(key) ||
      params.has(key)
    ) {
      throw new Error('중복되거나 지원하지 않는 조건 이름입니다.');
    }
    params.set(key, values[i + 1]);
  }
  let api = route.api;
  if (route.detail) {
    const id = params.get('productId');
    if (!id || ['.', '..'].includes(id)) throw new Error('상품 ID를 입력해주세요.');
    api = api.replace(':productId', encodeURIComponent(id));
    params.delete('productId');
  }
  const target = new URL(api, source.origin);
  params.set('format', 'html');
  target.search = params.toString();
  return target;
}
