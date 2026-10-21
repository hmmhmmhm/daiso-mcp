/** 검색·읽기 사본의 안내 세대를 구분하는 고정 버전 */
export const AGENT_GUIDE_VERSION = '2026-10-21.2';
export const AGENT_GUIDE_UPDATED = '2026-10-21';
export const AGENT_GUIDE_STAMP = `안내 버전: ${AGENT_GUIDE_VERSION} · 갱신일: ${AGENT_GUIDE_UPDATED}`;
export const WEB_SEARCH_DESCRIPTION = 'ChatGPT 웹 읽기로 설치·API 키·MCP 연결 설정 없이 바로 상품을 조회하세요. URL 열기로 /api/daiso/products?q=검색어&format=html을 사용합니다. 다이소·편의점 재고와 영화·생활 정보도 지원합니다.';

/** 웹 읽기 환경에서 조회 형식을 선택하는 공통 규칙 */
export const WEB_READ_RULE = '웹 읽기 전용 에이전트: 모든 /api/* GET 조회 URL에 format=html을 반드시 포함하세요. 상품 검색뿐 아니라 상세·매장·재고·후속 조회에도 적용합니다. 아래 문서의 JSON 응답 예시는 필드 설명이며 웹 읽기로 JSON 주소를 열라는 뜻이 아닙니다. JSON URL이 읽히지 않으면 format=html로 다시 조회하고, 그 실패만으로 서비스 장애·로그인 필요·이 환경에서 실행할 수 없다고 단정하지 마세요.';

/** 셸 존재를 네트워크 접근 가능 여부로 오해하지 않는 실행 순서 */
export const ROUTE_SELECTION_TEXT = `1. 연결된 MCP 도구가 있으면 search_products {"service":"daiso","query":"수납박스","pageSize":3}를 호출합니다.
2. 웹 읽기(open/WebFetch)가 가능하면 HTML GET 주소를 바로 엽니다. 셸이 있어도 연결된 MCP 도구가 없으면 이 경로가 우선입니다. 웹 검색(search)은 URL 열기(open)를 대신하지 않습니다.
3. 위 두 수단이 없을 때만 외부 통신 가능한 셸에서 아래 POST를 사용합니다. 셸 DNS 오류는 그 실행 환경의 실패이며 웹 GET 실패나 서버 장애의 근거가 아닙니다. 웹 읽기가 가능하면 HTML GET으로 즉시 전환합니다.`;

/** 유사 상품의 웹 검색 이미지를 실제 상품 사진으로 오인하지 않도록 제한합니다. */
export const IMAGE_SOURCE_RULE = '상품 이미지는 해당 조회 응답의 imageUrl만 사용하세요. 전체 URL과 query string을 유지합니다. imageUrl이 없거나 표시되지 않으면 이미지를 생략하고 웹 검색 이미지·다른 상품·다른 국가의 이미지로 대체하지 마세요.';

/** 실행 기록 없이 성공·실패나 HTTP 상태를 단정하지 않도록 안내합니다. */
export const EXECUTION_EVIDENCE_RULE = '실제로 실행한 도구·요청 URL·반환 데이터와 확인된 오류만 보고하세요. 실행하지 않은 웹 GET을 실패했다고 말하거나 검색 결과·문서 예제를 실제 조회 결과로 제시하지 마세요. 도구가 HTTP 상태를 제공하지 않으면 HTTP 200이라고 추정하지 마세요. REST GET 성공과 MCP 도구 호출 성공은 구분합니다.';

/** 설치 없이 첫 실제 조회를 실행하는 에이전트 안내 */
export function buildAgentStartText(baseUrl: string): string {
  return `# DAISO MCP: 설치 없이 시작하기
${AGENT_GUIDE_STAMP}

**${WEB_READ_RULE}**

공개 원격 MCP: https://mcp.aka.page
전송: Streamable HTTP · 인증: 없음 (사용자 API 키 불필요)
전체 도구 목록이나 OpenAPI를 먼저 읽을 필요는 없습니다. 설치나 사용자에게 연결 설정을 요구하기 전에 아래 순서로 첫 실제 조회를 실행하세요.

${ROUTE_SELECTION_TEXT}

웹 읽기용 첫 조회 (사용자 검색어로 q를 바꾸세요):
${baseUrl}/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&pageSize=3&format=html
이것은 공개 REST GET이며 MCP 프로토콜 호출이 아닙니다. 상품 결과의 실제 id로 상세·재고를 조회하고 모든 후속 URL에도 format=html을 붙이세요. 상품 검색만으로 매장 재고를 단정하지 마세요.

${IMAGE_SOURCE_RULE}
${EXECUTION_EVIDENCE_RULE}

셸 전용 대안: 루트 POST의 stateless 호출은 이 서버가 지원하는 단축 경로입니다. /mcp 및 범용 클라이언트 연결은 initialize → notifications/initialized 후 mcp-session-id를 전달합니다.
\`\`\`bash
curl --max-time 20 -sS -N ${baseUrl}/ \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_products","arguments":{"service":"daiso","query":"수납박스","pageSize":3}}}'
\`\`\`
응답은 SSE의 data: JSON-RPC 메시지입니다. result.isError=true이거나 error 응답이면 실패입니다. 상품은 result.structuredContent.products 또는 content[].text의 JSON에서 읽으세요. 오류·미확인을 재고 0으로 해석하지 마세요.
기존 서비스별 MCP 이름은 deprecated 호출 별칭입니다. 새 연동은 공개 도구 10개만 사용하며 도구를 늘리지 않습니다.
상세 API와 서비스 안내: ${baseUrl}/prompt

---

`;
}

/** 캐시 가능한 시작 안내 응답을 생성합니다. */
export function createAgentStartResponse(baseUrl: string): Response {
  return new Response(buildAgentStartText(baseUrl), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
