/** 설치 없이 첫 실제 조회를 실행하는 에이전트 안내 */
export function buildAgentStartText(baseUrl: string): string {
  return `# Daiso MCP: 설치 없이 시작하기

공개 원격 MCP: https://mcp.aka.page
전송: Streamable HTTP · 인증: 없음 (사용자 API 키 불필요)
샌드박스·셸 없이 웹 읽기만 가능한 채팅 에이전트는 아래 HTML GET 주소를 먼저 여세요. npm 설치나 HTTP POST 실행이 필요 없습니다.
${baseUrl}/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&pageSize=3&format=html

다른 공개 GET API도 기존 파라미터에 format=html을 추가하면 실제 결과를 HTML로 읽을 수 있습니다. format을 생략하면 기존 JSON 응답입니다. 첫 결과의 상품 상세 링크도 HTML입니다. 오류는 HTTP 상태와 함께 표시되며 재고 없음으로 해석하면 안 됩니다.

전체 도구 목록이나 OpenAPI를 먼저 읽을 필요는 없습니다. 사용 가능한 실행 수단으로 아래 첫 조회를 실행하세요.

1. 원격 MCP 클라이언트가 있으면 공개 URL에 연결하세요. 표준 initialize → notifications/initialized 흐름을 사용하고 서버가 발급한 mcp-session-id를 전달합니다. 첫 도구는 daiso_search_products, 인자는 {"query":"수납박스","pageSize":3}입니다.
2. HTTP POST나 셸이 있으면 아래 한 요청으로 실제 MCP 도구를 호출할 수 있습니다. npm 설치는 필요 없습니다. 루트 POST의 stateless 호출은 이 서버가 지원하는 단축 경로이며, /mcp는 initialize가 필요합니다.

\`\`\`bash
curl --max-time 20 -sS -N ${baseUrl}/ \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"daiso_search_products","arguments":{"query":"수납박스","pageSize":3}}}'
\`\`\`

응답은 SSE의 data: JSON-RPC 메시지입니다. result.isError 또는 error를 확인하고, 상품은 result.structuredContent.products에서 읽으세요. content[].text에도 상품 JSON이 있습니다. 오류를 상품 없음으로 해석하지 마세요.

3. HTTP GET만 가능하면 공개 REST GET의 HTML 결과를 사용하세요. 이것은 MCP 프로토콜 호출이 아닙니다.
${baseUrl}/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&pageSize=3&format=html

실제 상품 결과의 id로 재고를 조회하세요. 예제 ID를 쓰거나 상품 검색 결과만으로 매장 재고를 단정하지 마세요.
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
