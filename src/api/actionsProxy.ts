/**
 * OpenAI Actions용 공통 GET 프록시 정의
 */

export interface ActionQueryDefinition {
  action: string;
  summary: string;
  targetPath: string;
  pathParam?: string;
}

export const ACTION_QUERY_DEFINITIONS: ActionQueryDefinition[] = [
  { action: 'daisoSearchProducts', summary: '다이소 제품 검색', targetPath: '/api/daiso/products' },
  { action: 'daisoGetProduct', summary: '다이소 제품 상세 조회', targetPath: '/api/daiso/products/:productId', pathParam: 'productId' },
  { action: 'daisoFindStores', summary: '다이소 매장 검색', targetPath: '/api/daiso/stores' },
  { action: 'daisoCheckInventory', summary: '다이소 재고 조회', targetPath: '/api/daiso/inventory' },
  { action: 'daisoGetDisplayLocation', summary: '다이소 진열 위치 조회', targetPath: '/api/daiso/display-location' },
  { action: 'oliveyoungSearchProducts', summary: '올리브영 상품 검색', targetPath: '/api/oliveyoung/products' },
  { action: 'oliveyoungFindStores', summary: '올리브영 매장 검색', targetPath: '/api/oliveyoung/stores' },
  { action: 'oliveyoungCheckInventory', summary: '올리브영 재고 조회', targetPath: '/api/oliveyoung/inventory' },
  { action: 'cuFindStores', summary: 'CU 매장 검색', targetPath: '/api/cu/stores' },
  { action: 'cuCheckInventory', summary: 'CU 재고 조회', targetPath: '/api/cu/inventory' },
  { action: 'emart24FindStores', summary: '이마트24 매장 검색', targetPath: '/api/emart24/stores' },
  { action: 'emart24SearchProducts', summary: '이마트24 상품 검색', targetPath: '/api/emart24/products' },
  { action: 'emart24CheckInventory', summary: '이마트24 재고 조회', targetPath: '/api/emart24/inventory' },
  { action: 'lottemartFindStores', summary: '롯데마트 매장 검색', targetPath: '/api/lottemart/stores' },
  { action: 'lottemartSearchProducts', summary: '롯데마트 상품 검색', targetPath: '/api/lottemart/products' },
  { action: 'gs25FindStores', summary: 'GS25 매장 검색', targetPath: '/api/gs25/stores' },
  { action: 'gs25SearchProducts', summary: 'GS25 상품 검색', targetPath: '/api/gs25/products' },
  { action: 'gs25CheckInventory', summary: 'GS25 재고 조회', targetPath: '/api/gs25/inventory' },
  { action: 'sevenelevenSearchProducts', summary: '세븐일레븐 상품 검색', targetPath: '/api/seveneleven/products' },
  { action: 'sevenelevenSearchStores', summary: '세븐일레븐 매장 검색', targetPath: '/api/seveneleven/stores' },
  { action: 'sevenelevenCheckInventory', summary: '세븐일레븐 재고 조회', targetPath: '/api/seveneleven/inventory' },
  { action: 'sevenelevenGetPopwords', summary: '세븐일레븐 인기 검색어 조회', targetPath: '/api/seveneleven/popwords' },
  { action: 'sevenelevenGetCatalog', summary: '세븐일레븐 카탈로그 조회', targetPath: '/api/seveneleven/catalog' },
  { action: 'megaboxFindTheaters', summary: '메가박스 지점 검색', targetPath: '/api/megabox/theaters' },
  { action: 'megaboxListMovies', summary: '메가박스 영화 목록 조회', targetPath: '/api/megabox/movies' },
  { action: 'megaboxGetSeats', summary: '메가박스 잔여 좌석 조회', targetPath: '/api/megabox/seats' },
  { action: 'lottecinemaFindTheaters', summary: '롯데시네마 지점 검색', targetPath: '/api/lottecinema/theaters' },
  { action: 'lottecinemaListMovies', summary: '롯데시네마 영화 목록 조회', targetPath: '/api/lottecinema/movies' },
  { action: 'lottecinemaGetSeats', summary: '롯데시네마 잔여 좌석 조회', targetPath: '/api/lottecinema/seats' },
  { action: 'cgvFindTheaters', summary: 'CGV 극장 검색', targetPath: '/api/cgv/theaters' },
  { action: 'cgvSearchMovies', summary: 'CGV 영화 목록 조회', targetPath: '/api/cgv/movies' },
  { action: 'cgvGetTimetable', summary: 'CGV 시간표 조회', targetPath: '/api/cgv/timetable' },
] as const;

const ACTION_QUERY_MAP = new Map(
  ACTION_QUERY_DEFINITIONS.map((definition) => [definition.action, definition]),
);

export const ACTION_QUERY_ACTIONS = ACTION_QUERY_DEFINITIONS.map(
  (definition) => definition.action,
);

function toAbsoluteUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    return new URL(value, 'https://actions-proxy.local');
  }
}

export function getActionQueryDefinition(
  action: string,
): ActionQueryDefinition | undefined {
  return ACTION_QUERY_MAP.get(action);
}

export function buildActionQueryTargetUrl(requestUrl: string): URL {
  const sourceUrl = toAbsoluteUrl(requestUrl);
  const action = (sourceUrl.searchParams.get('action') || '').trim();

  if (action.length === 0) {
    throw new Error('action 파라미터를 입력해주세요.');
  }

  const definition = getActionQueryDefinition(action);
  if (!definition) {
    throw new Error(`지원하지 않는 action 입니다: ${action}`);
  }

  let pathname = definition.targetPath;
  const consumedParams = new Set(['action']);

  if (definition.pathParam) {
    const pathValue = (sourceUrl.searchParams.get(definition.pathParam) || '').trim();
    if (pathValue.length === 0) {
      throw new Error(`${definition.pathParam} 파라미터를 입력해주세요.`);
    }

    pathname = pathname.replace(`:${definition.pathParam}`, encodeURIComponent(pathValue));
    consumedParams.add(definition.pathParam);
  }

  const targetUrl = new URL(pathname, sourceUrl.origin);
  for (const [key, value] of sourceUrl.searchParams.entries()) {
    if (consumedParams.has(key)) {
      continue;
    }

    targetUrl.searchParams.append(key, value);
  }

  return targetUrl;
}

export function createActionQueryDescriptionList(): string {
  return ACTION_QUERY_DEFINITIONS.map(
    (definition) => `- \`${definition.action}\`: ${definition.summary}`,
  ).join('\n');
}
