/**
 * OpenAI Actions용 축약 OpenAPI 스펙
 */
import { ACTION_QUERY_PARAMETERS } from './openapiSpecActionParameters.js';
import { OPENAPI_COMPONENTS } from './openapiSpecComponents.js';

export function generateOpenApiSpec(baseUrl: string): object {
  return {
    openapi: '3.1.0',
    info: {
      title: 'DAISO MCP API (OpenAI Actions용)',
      description: `OpenAI 챗봇의 OpenAPI import 개수 제한을 피하기 위해 모든 GET API를 단일 facade 엔드포인트로 집약한 스펙입니다.

실제 런타임은 기존 /api/{service}/... 엔드포인트로 위임하며, 이 스펙은 OpenAI Actions 등록 전용으로 사용합니다.

브랜드명이 요청 앞부분에 나오면 뒤의 상품/재고 요청까지 같은 브랜드로 해석해야 합니다. 예: "안산 중앙역 주변 다이소 찾아주시고 핫식스 재고 찾아주세요"는 다이소 기준 조회를 먼저 수행하고, 결과가 없을 때만 다른 브랜드를 제안합니다.

일본 다이소는 상품·매장 검색과 온라인 구매 가능 여부만 제공하며 매장별 재고는 지원하지 않습니다. 오피넷 유가·주유소 조회도 action 선택값으로 제공합니다. 실패와 미확인 수량을 재고 0으로 해석하지 마세요.
전체 개별 엔드포인트 스펙이 필요하면 /openapi-full.json 또는 /openapi-full.yaml 을 사용하세요.`,
      version: '1.1.0',
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
