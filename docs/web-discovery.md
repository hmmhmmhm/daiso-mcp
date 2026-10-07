# 웹에서 다이소 MCP 발견하기

[공개 첫 화면](https://mcp.aka.page/)은 설치 없는 사용 방법과 첫 실제 조회 링크를 HTML로 제공합니다. 웹 읽기 기능만으로 MCP 도구가 자동 등록되는 것은 아닙니다. 원격 MCP 클라이언트, HTTP POST 또는 공개 REST GET 중 에이전트가 실행할 수 있는 방식을 선택합니다.

- `/`: HTML 안내. `Accept: application/json`이면 기존 서버 정보 JSON.
- `/root.json`: 현재 서비스·도구 목록 JSON. API 클라이언트는 이 명시적 주소를 권장합니다.
- `/llms.txt`: 짧은 에이전트 시작 안내.
- `/prompt`: 전체 API 사용 안내.
- `/robots.txt`, `/sitemap.xml`: 검색과 AI 에이전트의 발견 안내.

robots.txt는 hmart.app과 같은 방식으로 `User-agent: *`와 주요 AI 봇에 `Allow: /`를 명시합니다. 검색용 OAI-SearchBot, 사용자 요청용 ChatGPT-User, 학습용 GPTBot을 별도 그룹으로 표시합니다. robots 허용은 요청 제한이나 보안 검사를 우회하지 않습니다.

## 배포와 운영 설정

`npm run build:discovery`는 현재 레지스트리에서 `public-discovery/`의 HTML·JSON·robots·sitemap·llms 자산을 다시 생성합니다. Wrangler의 `[build]`가 매 배포 전에 실행합니다. 생성물은 Git에 넣지 않습니다. 정적 Assets로 제공하며 SPA fallback은 사용하지 않습니다.

**루트에 index.html을 추가하지 않습니다.** Assets가 루트 POST를 405로 처리할 수 있어 기존 MCP 호출이 막힙니다. HTML은 `/discovery.html`에 두고 다음 Cloudflare URL Rewrite 규칙으로 공개 GET/HEAD만 내부 연결합니다.

```text
(http.host eq "mcp.aka.page" and http.request.method in {"GET" "HEAD"} and http.request.uri.path eq "/" and not any(http.request.headers["accept"][*] contains "application/json"))
```

작업은 경로를 `/discovery.html`로 정적 재작성하고 쿼리를 유지합니다. 브라우저 주소는 `/`로 남고 외부 호스트로 이동하지 않습니다. POST·DELETE·OPTIONS 및 JSON 클라이언트는 기존 Worker 경로를 사용합니다. workers.dev 등 이 규칙이 없는 도메인은 Worker의 HTML/JSON 응답으로 동작합니다.

기존 `mcp.aka.page/`에서 R2 JSON으로 보내던 302 규칙은 제거 또는 교체해야 합니다. 과거 `mcp-root.aka.page/root.json` 링크는 현재 `https://mcp.aka.page/root.json`으로 연결해 오래된 별도 사본을 발견 경로에서 제외합니다. 앞으로 메타데이터는 레지스트리 한 곳에서 생성합니다.

## 배포 후 확인

1. `/`가 외부 리디렉션 없이 HTTP 200 HTML인지 확인합니다.
2. `Accept: application/json`의 `/`와 `/root.json`의 목록이 일치하고 중단한 롯데마트가 없는지 확인합니다.
3. `/robots.txt`, `/sitemap.xml`, `/llms.txt`가 HTTP 200인지 확인합니다.
4. 루트 POST `tools/list`와 `tools/call`을 실제 실행합니다. GET 화면만으로 MCP 정상 동작을 주장하지 않습니다.
5. 없는 API 경로는 기존 404를 유지하는지 확인합니다.
6. 검색/웹 읽기 도구에서 새 HTML이 읽히는지 별도로 확인합니다. HTTP 200과 robots 허용만으로 도구 내부 캐시나 읽기 성공을 보장할 수 없습니다.

OpenAI 검색·사용자 요청·학습 봇의 역할과 공개 IP는 [공식 봇 문서](https://developers.openai.com/api/docs/bots)를 참조합니다. Cloudflare 제공 방식은 [Assets 라우팅 문서](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)를 참조합니다.
