import type { PlaceCategory, PlacesSearchResult, NearbyPlace } from './types.js';

interface NaverLocalItem {
  title?: string;
  link?: string;
  category?: string;
  description?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
}

interface NaverLocalResponse {
  total?: number;
  start?: number;
  display?: number;
  items?: NaverLocalItem[];
  errorMessage?: string;
}

export interface SearchNaverLocalPlacesArgs {
  naverClientId?: string;
  naverClientSecret?: string;
  location?: string;
  keyword?: string;
  category?: PlaceCategory;
  limit?: number;
  start?: number;
  sort?: 'random' | 'comment';
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const CATEGORY_KEYWORDS: Record<PlaceCategory, string> = {
  restaurant: '음식점',
  cafe: '카페',
  food: '음식점',
  dessert: '디저트',
  all: '',
};

const HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function getProcessEnvValue(name: string): string | undefined {
  /* c8 ignore next -- Node 테스트와 CLI 런타임은 process를 제공하며, Worker에는 API에서 키를 주입합니다. */
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

function stripHtmlTags(value: string): string {
  let result = '';
  let insideTag = false;

  for (const character of value) {
    if (character === '<') {
      insideTag = true;
      continue;
    }
    if (character === '>' && insideTag) {
      insideTag = false;
      continue;
    }
    if (!insideTag) {
      result += character;
    }
  }

  return result;
}

function cleanHtml(value: string | undefined): string {
  if (!value) {
    return '';
  }
  let result = stripHtmlTags(value);
  for (const [entity, replacement] of Object.entries(HTML_ENTITY_REPLACEMENTS)) {
    result = result.split(entity).join(replacement);
  }
  return result.trim();
}

function toCoordinate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed / 10000000;
}

function clampDisplay(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 5;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 5);
}

function clampStart(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 1000);
}

export function buildNaverLocalQuery({
  location = '',
  keyword = '',
  category = 'all',
}: Pick<SearchNaverLocalPlacesArgs, 'location' | 'keyword' | 'category'>): string {
  const parts = [location.trim(), keyword.trim() || CATEGORY_KEYWORDS[category]].filter(
    (part) => part.length > 0,
  );
  return parts.join(' ').trim();
}

function normalizePlace(item: NaverLocalItem): NearbyPlace {
  return {
    name: cleanHtml(item.title),
    category: cleanHtml(item.category),
    address: cleanHtml(item.address),
    roadAddress: cleanHtml(item.roadAddress),
    phone: cleanHtml(item.telephone),
    link: item.link,
    longitude: toCoordinate(item.mapx),
    latitude: toCoordinate(item.mapy),
    raw: item as Record<string, unknown>,
  };
}

export async function searchNaverLocalPlaces(
  args: SearchNaverLocalPlacesArgs,
): Promise<PlacesSearchResult> {
  const naverClientId = args.naverClientId?.trim() || getProcessEnvValue('NAVER_CLIENT_ID')?.trim();
  const naverClientSecret =
    args.naverClientSecret?.trim() || getProcessEnvValue('NAVER_CLIENT_SECRET')?.trim();

  if (!naverClientId || !naverClientSecret) {
    throw new Error('NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경 변수가 필요합니다.');
  }

  const category = args.category ?? 'all';
  const location = args.location?.trim() ?? '';
  const query = buildNaverLocalQuery({
    location,
    keyword: args.keyword,
    category,
  });

  if (query.length === 0) {
    throw new Error('위치(location) 또는 검색어(keyword)를 입력해주세요.');
  }

  const url = new URL('https://openapi.naver.com/v1/search/local.json');
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(clampDisplay(args.limit)));
  url.searchParams.set('start', String(clampStart(args.start)));
  url.searchParams.set('sort', args.sort ?? 'random');

  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(url.toString(), {
    headers: {
      'X-Naver-Client-Id': naverClientId,
      'X-Naver-Client-Secret': naverClientSecret,
    },
    signal: AbortSignal.timeout(args.timeoutMs ?? 10000),
  });

  const bodyText = await response.text();
  let parsed: NaverLocalResponse;
  try {
    parsed = JSON.parse(bodyText) as NaverLocalResponse;
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const message = parsed.errorMessage || bodyText || `HTTP ${response.status}`;
    throw new Error(`네이버 지역 검색 실패: ${message}`);
  }

  const places = (parsed.items ?? []).map(normalizePlace);
  return {
    provider: 'naverLocal',
    searchMode: 'keyword',
    query,
    category,
    location,
    totalCount: parsed.total ?? places.length,
    count: places.length,
    places,
  };
}
