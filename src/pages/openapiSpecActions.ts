/**
 * OpenAI Actions용 축약 OpenAPI 스펙
 */

import { ACTION_QUERY_ACTIONS } from '../api/actionsProxy.js';
import { OPENAPI_COMPONENTS } from './openapiSpecComponents.js';

const ACTION_QUERY_PARAMETERS = [
  {
    name: 'action',
    in: 'query',
    required: true,
    description:
      '실행할 액션 이름입니다. 사용 가능한 값은 enum 목록을 참고하세요.',
    schema: {
      type: 'string',
      enum: ACTION_QUERY_ACTIONS,
    },
  },
  { name: 'q', in: 'query', required: false, description: '다이소 제품 검색어', schema: { type: 'string' } },
  { name: 'query', in: 'query', required: false, description: '세븐일레븐 상품 검색어', schema: { type: 'string' } },
  { name: 'itemCode', in: 'query', required: false, description: 'GS25 상품 코드', schema: { type: 'string' } },
  { name: 'productId', in: 'query', required: false, description: '제품 ID 또는 상세 조회용 path 파라미터. 상품명만 알면 먼저 daisoSearchProducts 또는 /api/daiso/products로 productId를 확인하세요.', schema: { type: 'string' } },
  { name: 'keyword', in: 'query', required: false, description: '공통 키워드 파라미터', schema: { type: 'string' } },
  { name: 'sido', in: 'query', required: false, description: '다이소 시/도', schema: { type: 'string' } },
  { name: 'gugun', in: 'query', required: false, description: '다이소 구/군', schema: { type: 'string' } },
  { name: 'dong', in: 'query', required: false, description: '다이소 동', schema: { type: 'string' } },
  { name: 'area', in: 'query', required: false, description: '롯데마트 지역', schema: { type: 'string' } },
  { name: 'area1', in: 'query', required: false, description: '이마트24 1차 지역', schema: { type: 'string' } },
  { name: 'area2', in: 'query', required: false, description: '이마트24 2차 지역', schema: { type: 'string' } },
  { name: 'areaCode', in: 'query', required: false, description: '메가박스 지역 코드', schema: { type: 'string' } },
  { name: 'brandVariant', in: 'query', required: false, description: '롯데마트 브랜드 변형', schema: { type: 'string' } },
  { name: 'lat', in: 'query', required: false, description: '위도', schema: { type: 'number', format: 'float' } },
  { name: 'lng', in: 'query', required: false, description: '경도', schema: { type: 'number', format: 'float' } },
  { name: 'page', in: 'query', required: false, description: '페이지 번호', schema: { type: 'integer' } },
  { name: 'pageIdx', in: 'query', required: false, description: '올리브영 페이지 번호', schema: { type: 'integer' } },
  { name: 'pageLimit', in: 'query', required: false, description: '롯데마트 추가 페이지 수', schema: { type: 'integer' } },
  { name: 'pageSize', in: 'query', required: false, description: '페이지 크기', schema: { type: 'integer' } },
  { name: 'size', in: 'query', required: false, description: '페이지 크기 또는 검색 크기', schema: { type: 'integer' } },
  { name: 'offset', in: 'query', required: false, description: 'CU 검색 오프셋', schema: { type: 'integer' } },
  { name: 'limit', in: 'query', required: false, description: '최대 결과 수', schema: { type: 'integer' } },
  { name: 'storeLimit', in: 'query', required: false, description: '매장 결과 제한 수', schema: { type: 'integer' } },
  { name: 'storeCode', in: 'query', required: false, description: '매장 코드. 다이소 진열 위치는 /api/daiso/inventory 응답의 storeInventory.stores[].storeCode에서 확인하세요.', schema: { type: 'string' } },
  { name: 'storeName', in: 'query', required: false, description: '매장명. 롯데마트 상품 조회에서 storeCode가 없을 때 사용하며, 모르면 먼저 lottemartFindNearbyStores 또는 /api/lottemart/stores로 확인하세요.', schema: { type: 'string' } },
  { name: 'storeKeyword', in: 'query', required: false, description: '매장 키워드', schema: { type: 'string' } },
  { name: 'playDate', in: 'query', required: false, description: '상영일(YYYYMMDD)', schema: { type: 'string' } },
  { name: 'regionCode', in: 'query', required: false, description: 'CGV 지역 코드', schema: { type: 'string' } },
  { name: 'theaterCode', in: 'query', required: false, description: 'CGV 극장 코드', schema: { type: 'string' } },
  { name: 'theaterId', in: 'query', required: false, description: '메가박스/롯데시네마 지점 ID', schema: { type: 'string' } },
  { name: 'movieCode', in: 'query', required: false, description: 'CGV 영화 코드', schema: { type: 'string' } },
  { name: 'movieId', in: 'query', required: false, description: '메가박스/롯데시네마 영화 ID', schema: { type: 'string' } },
  { name: 'pluCd', in: 'query', required: false, description: '이마트24 상품 PLU 코드', schema: { type: 'string' } },
  { name: 'bizNoArr', in: 'query', required: false, description: '이마트24 사업자번호 목록', schema: { type: 'string' } },
  { name: 'label', in: 'query', required: false, description: '세븐일레븐 인기 검색어 라벨', schema: { type: 'string' } },
  { name: 'sort', in: 'query', required: false, description: '정렬 기준', schema: { type: 'string' } },
  { name: 'searchSort', in: 'query', required: false, description: 'CU 검색 정렬 기준', schema: { type: 'string' } },
  { name: 'service24h', in: 'query', required: false, description: '이마트24 24시간 필터', schema: { type: 'boolean' } },
  { name: 'includeSoldOut', in: 'query', required: false, description: '올리브영 품절 포함 여부', schema: { type: 'boolean' } },
  { name: 'includeIssues', in: 'query', required: false, description: '세븐일레븐 이달의 행사지 포함 여부', schema: { type: 'boolean' } },
  { name: 'includeExhibition', in: 'query', required: false, description: '세븐일레븐 전시상품 포함 여부', schema: { type: 'boolean' } },
  { name: 'timeoutMs', in: 'query', required: false, description: '세븐일레븐 inventory 타임아웃', schema: { type: 'integer' } },
] as const;

export function generateOpenApiSpec(baseUrl: string): object {
  return {
    openapi: '3.1.0',
    info: {
      title: '다이소 MCP API (OpenAI Actions용)',
      description: `OpenAI 챗봇의 OpenAPI import 개수 제한을 피하기 위해 모든 GET API를 단일 facade 엔드포인트로 집약한 스펙입니다.

실제 런타임은 기존 /api/{service}/... 엔드포인트로 위임하며, 이 스펙은 OpenAI Actions 등록 전용으로 사용합니다.

브랜드명이 요청 앞부분에 나오면 뒤의 상품/재고 요청까지 같은 브랜드로 해석해야 합니다. 예: "안산 중앙역 주변 다이소 찾아주시고 핫식스 재고 찾아주세요"는 다이소 기준 조회를 먼저 수행하고, 결과가 없을 때만 다른 브랜드를 제안합니다.

전체 개별 엔드포인트 스펙이 필요하면 /openapi-full.json 또는 /openapi-full.yaml 을 사용하세요.`,
      version: '1.0.0',
      contact: {
        name: 'GitHub Repository',
        url: 'https://github.com/hmmhmmhm/daiso-mcp',
      },
    },
    servers: [{ url: baseUrl, description: 'Production Server' }],
    paths: {
      '/api/actions/query': {
        get: {
          operationId: 'queryAction',
          summary: '공통 GET 액션 실행',
          description:
            'action 값에 따라 기존 GET API 엔드포인트로 프록시합니다. OpenAI Actions 등록 시 이 단일 엔드포인트를 사용하세요.',
          parameters: ACTION_QUERY_PARAMETERS,
          responses: {
            '200': {
              description: '프록시 호출 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ActionQueryResponse' },
                },
              },
            },
            '400': {
              description: '잘못된 요청',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: OPENAPI_COMPONENTS,
  };
}
