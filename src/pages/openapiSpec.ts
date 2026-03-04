/**
 * OpenAPI 스펙 조합 모듈
 */

import { OPENAPI_PATHS_DAISO_OLIVEYOUNG } from './openapiSpecPathsDaisoOliveyoung.js';
import { OPENAPI_PATHS_MEGABOX } from './openapiSpecPathsMegabox.js';
import { OPENAPI_PATHS_CGV } from './openapiSpecPathsCgv.js';
import { OPENAPI_COMPONENTS } from './openapiSpecComponents.js';

/**
 * OpenAPI 스펙 생성
 */
export function generateOpenApiSpec(baseUrl: string): object {
  return {
    openapi: '3.1.0',
    info: {
      title: '다이소 MCP API',
      description: `다이소 제품 검색, 매장 찾기, 재고 확인을 위한 API입니다.

## 주요 기능
- 🔍 **제품 검색**: 키워드로 다이소 제품 검색
- 🏪 **매장 찾기**: 지역/키워드로 매장 검색
- 📦 **재고 확인**: 온라인 및 오프라인 매장 재고 조회
- 🎬 **메가박스 지점/영화 조회**: 주변 지점, 상영 목록, 잔여 좌석 조회
- 🎥 **CGV 지점/영화 조회**: 극장 목록, 영화 목록, 시간표 조회

## 사용 팁
1. 한글 검색어는 URL 인코딩이 자동 처리됩니다
2. 재고 확인 시 먼저 제품 검색으로 제품 ID를 확인하세요
3. 위치 기반 재고 조회 시 lat, lng 파라미터를 활용하세요`,
      version: '1.0.0',
      contact: {
        name: 'GitHub Repository',
        url: 'https://github.com/hmmhmmhm/daiso-mcp',
      },
    },
    servers: [{ url: baseUrl, description: 'Production Server' }],
    paths: {
      ...OPENAPI_PATHS_DAISO_OLIVEYOUNG,
      ...OPENAPI_PATHS_MEGABOX,
      ...OPENAPI_PATHS_CGV,
    },
    components: OPENAPI_COMPONENTS,
  };
}
