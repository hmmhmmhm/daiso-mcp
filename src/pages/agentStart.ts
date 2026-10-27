/** 검색·읽기 사본의 안내 세대를 구분하는 고정 버전 */
export const AGENT_GUIDE_VERSION = '2026-10-27.2';
export const AGENT_GUIDE_UPDATED = '2026-10-27';
export const AGENT_GUIDE_STAMP = `안내 버전: ${AGENT_GUIDE_VERSION} · 갱신일: ${AGENT_GUIDE_UPDATED}`;
export const AGENT_GUIDE_PATH = `/guide/${AGENT_GUIDE_VERSION}`;
export const WEB_SEARCH_DESCRIPTION =
  'ChatGPT 웹 읽기로 설치·API 키·MCP 연결 설정 없이 조회하세요. /browse/read의 실제 링크 ID를 click하고 임의 검색어·지역을 글자로 선택합니다. 같은 조건의 새 응답 링크로 새 HTML 주소를 확인할 수 있습니다. 다이소·편의점 재고와 영화·생활 정보도 지원합니다.';

/** 웹 읽기 환경에서 쿼리 없는 HTML 경로를 우선합니다. */
export const WEB_READ_RULE =
  '웹 조회는 /browse/ 경로를 사용하세요. 실제 브라우저 도구가 있으면 /browse/ HTML을 열고, 웹 읽기(open/WebFetch)만 있으면 /browse/read의 실제 링크 ID로 click하여 시작하세요. 새 URL을 조립하지 말고 글자 선택·상품·매장 지역 선택 링크를 따르세요. 오래된 수집본이면 같은 조건으로 새 응답 확인 링크를 최대2번 선택해 새 주소와 HTML 생성 시각을 확인하세요. 이 경로도 기존 API 캐시·한도·권한을 사용하며 원본 재고 갱신을 보장하지 않습니다. TimeoutError는 같은 실제 링크를 한 번만 재확인하고 계속 실패하면 미확인으로 보고하세요. URL 접근 거절을 같은 주소의 직접 open으로 반복하지 마세요. Crawled today만으로 현재 재고를 단정하지 말고 응답 생성 시각을 보고하세요. 모든 후속 /browse/ 조회는 자동 HTML이며 쿼리 문자열은 필요 없습니다. JSON API·셸로 우회하거나 브라우저를 추가로 계속 실행하지 마세요. 접근 오류를 상품 없음·재고0·로그인 필요로 단정하지 마세요. 해당 오류만으로 이 환경에서 실행할 수 없다고 단정하지 마세요.';

/** 셸 존재를 네트워크 접근 가능 여부로 오해하지 않는 실행 순서 */
export const ROUTE_SELECTION_TEXT = `1. 연결된 MCP 도구가 있으면 search_products {"service":"daiso","query":"수납박스","pageSize":3}를 호출합니다.
2. 실제 브라우저 도구가 있으면 /browse/ HTML GET 주소를 열고 페이지의 실제 상품·매장·재고를 읽습니다. Work의 내장 브라우저도 이 경로를 사용합니다.
3. 웹 읽기(open/WebFetch)만 가능하면 /browse/read의 실제 링크 ID로 click합니다. 임의 검색어를 글자로 선택하고 상품의 매장 지역 선택으로 재고를 조회합니다. 이전 HTML이면 같은 조건의 새 응답 링크를 최대2번 선택하고 생성 시각을 확인하세요. TimeoutError 재확인은 한 번만 합니다. 도구에 click이 없으면 실제 링크를 열되 같은 동작을 보장하지 않습니다. 수집본이나 미확인 수량을 현재 재고0으로 바꾸지 마세요.
4. 위 세 수단이 없거나 모두 실패하면 실제 조회 제약과 오류를 알립니다. 셸이 있어도 설치 없는 웹 조회가 우선입니다. 터미널·셸 호출로 우회하지 않습니다. 셸 DNS 오류를 웹 GET 실패나 서버 장애로 확대하지 말고 실제로 실행하지 않은 요청의 실패를 만들지 마세요.`;

/** 유사 상품의 웹 검색 이미지를 실제 상품 사진으로 오인하지 않도록 제한합니다. */
export const IMAGE_SOURCE_RULE =
  '상품 이미지는 해당 조회 응답의 imageUrl만 사용하세요. image_query·이미지 검색·검색 이미지 캐러셀은 사용하지 마세요. 카드의 원본 이미지 Markdown을 그대로 쓰고, 표시할 수 없으면 원본 링크와 텍스트만 제공하세요. 전체 URL과 query string을 유지합니다. imageUrl이 없거나 표시되지 않으면 이미지를 생략하고 웹 검색 이미지·다른 상품·다른 국가의 이미지로 대체하지 마세요.';

/** 실행 기록 없이 성공·실패나 HTTP 상태를 단정하지 않도록 안내합니다. */
export const EXECUTION_EVIDENCE_RULE =
  '실제로 실행한 도구·요청 URL·반환 데이터와 확인된 오류만 보고하세요. 웹 읽기의 Crawled 시점과 HTML의 응답 생성 시각을 확인하고 오래된 수집본을 현재 재고로 단정하지 마세요. 응답 생성 시각은 원본 재고 갱신 시각이 아닙니다. 실행하지 않은 웹 GET을 실패했다고 말하거나 검색 결과·문서 예제를 실제 조회 결과로 제시하지 마세요. 도구가 HTTP 상태를 제공하지 않으면 HTTP 200이라고 추정하지 마세요. REST GET 성공과 MCP 도구 호출 성공은 구분합니다.';

/** 설치 없이 첫 실제 조회를 실행하는 에이전트 안내 */
export function buildAgentStartText(baseUrl: string): string {
  return `# DAISO MCP: 설치 없이 시작하기
${AGENT_GUIDE_STAMP}
최신 안내: ${baseUrl}${AGENT_GUIDE_PATH} (이전 버전은 /guide/latest에서 갱신). 버전 없는 검색 사본을 최신이라고 추정하지 마세요.

**${WEB_READ_RULE}**

공개 원격 MCP: https://mcp.aka.page
전송: Streamable HTTP · 인증: 없음 (사용자 API 키 불필요)
전체 도구 목록이나 OpenAPI를 먼저 읽을 필요는 없습니다. 설치나 사용자에게 연결 설정을 요구하기 전에 아래 순서로 첫 실제 조회를 실행하세요.

${ROUTE_SELECTION_TEXT}

웹 읽기 시작 (문서의 실제 링크 ID를 선택):
${baseUrl}/browse/read
응답의 글자 입력 링크에서 임의 상품명·매장 지역을 선택하세요. 수납박스·핫식스 등 예제도 이 화면의 실제 링크로 조회합니다. 동일 주소의 수집본이 오래됐으면 새 응답 확인 링크를 선택하세요. 새 HTML 주소도 원본 API의 캐시를 사용하며 원본 재고의 새 갱신을 보장하지 않습니다.
이것은 공개 REST GET의 웹 조회이며 MCP 프로토콜 호출이 아닙니다. 상품 결과의 실제 상품 상세·매장 지역 선택 링크를 따르세요. 지역 입력 후 표시된 실제 재고 조회 링크를 선택합니다. 후속 URL을 새로 조립하지 마세요. 상품 검색만으로 매장 재고를 단정하지 마세요. 일반 API 클라이언트의 경로·필터 문법은 상세 사용 안내를 참고하세요.

${IMAGE_SOURCE_RULE}
${EXECUTION_EVIDENCE_RULE}

연결된 MCP 클라이언트는 initialize 절차를 처리합니다. MCP 결과의 isError=true/error를 확인하고 structuredContent 또는 content[].text에서 실제 상품을 읽습니다. 웹 읽기는 위 화면의 실제 링크 ID로 click하세요.
기존 서비스별 MCP 이름은 deprecated 호출 별칭입니다. 새 연동은 공개 도구 10개만 사용하며 도구를 늘리지 않습니다.
상세 API와 서비스 안내: ${baseUrl}/prompt · 전체 웹 조회: ${baseUrl}/browse

---

`;
}

/** 캐시 가능한 시작 안내 응답을 생성합니다. */
export function createAgentStartResponse(baseUrl: string): Response {
  return new Response(buildAgentStartText(baseUrl), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 오래된 버전 주소도 현재 안내로 연결하며 영구 리다이렉트 캐시를 만들지 않습니다. */
export function createVersionedGuideResponse(baseUrl: string, version: string): Response {
  if (version === AGENT_GUIDE_VERSION) return createAgentStartResponse(baseUrl);
  return new Response(null, {
    status: 307,
    headers: { Location: AGENT_GUIDE_PATH, 'Cache-Control': 'no-store' },
  });
}
