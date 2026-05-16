/**
 * OpenAPI 컴포넌트 스키마 정의
 */

import { OPENAPI_CGV_COMPONENT_SCHEMAS } from './openapiSpecComponentsCgv.js';
import { OPENAPI_CU_COMPONENT_SCHEMAS } from './openapiSpecComponentsCu.js';
import { OPENAPI_DAISO_OLIVEYOUNG_COMPONENT_SCHEMAS } from './openapiSpecComponentsDaisoOliveyoung.js';
import { OPENAPI_EMART24_COMPONENT_SCHEMAS } from './openapiSpecComponentsEmart24.js';
import { OPENAPI_GS25_COMPONENT_SCHEMAS } from './openapiSpecComponentsGs25.js';
import { OPENAPI_LOTTECINEMA_COMPONENT_SCHEMAS } from './openapiSpecComponentsLottecinema.js';
import { OPENAPI_LOTTEMART_COMPONENT_SCHEMAS } from './openapiSpecComponentsLotteMart.js';
import { OPENAPI_MEGABOX_COMPONENT_SCHEMAS } from './openapiSpecComponentsMegabox.js';
import { OPENAPI_SEVENELEVEN_COMPONENT_SCHEMAS } from './openapiSpecComponentsSeveneleven.js';

export const OPENAPI_COMPONENTS = {
  schemas: {
    ...OPENAPI_DAISO_OLIVEYOUNG_COMPONENT_SCHEMAS,
    ...OPENAPI_MEGABOX_COMPONENT_SCHEMAS,
    ...OPENAPI_CU_COMPONENT_SCHEMAS,
    ...OPENAPI_EMART24_COMPONENT_SCHEMAS,
    ...OPENAPI_LOTTEMART_COMPONENT_SCHEMAS,
    ...OPENAPI_GS25_COMPONENT_SCHEMAS,
    ...OPENAPI_SEVENELEVEN_COMPONENT_SCHEMAS,
    ...OPENAPI_LOTTECINEMA_COMPONENT_SCHEMAS,
    ...OPENAPI_CGV_COMPONENT_SCHEMAS,
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: '에러 코드', example: 'MISSING_QUERY' },
                message: {
                  type: 'string',
                  description: '에러 메시지',
                  example: '검색어(q)를 입력해주세요.',
                },
              },
            },
          },
        },
        ActionQueryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              additionalProperties: true,
              description: '대상 엔드포인트가 반환한 data 객체',
            },
            meta: {
              type: 'object',
              additionalProperties: true,
              description: '대상 엔드포인트가 반환한 meta 객체',
            },
          },
        },  },
};
