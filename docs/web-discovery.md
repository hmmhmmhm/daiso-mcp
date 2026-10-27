# 웹에서 다이소 MCP 발견하기

실제 브라우저가 있으면 /browse/ HTML을 엽니다. 웹 읽기만 있으면 [웹 조회 시작](https://mcp.aka.page/browse/read)의 실제 링크 ID로 click합니다. 이전 HTML은 같은 조건의 새 응답 링크를 최대2번 확인하고 TimeoutError 재확인은 한 번만 합니다. HTML 생성 시각은 원본 재고 갱신 시각이 아닙니다.

[공개 첫 화면](https://mcp.aka.page/)은 설치 없는 사용 방법과 첫 실제 조회 링크를 HTML로 제공합니다. 웹 읽기 기능만으로 MCP 도구가 자동 등록되는 것은 아닙니다. 연결된 MCP 도구를 먼저 사용하고, 없으면 실제 브라우저, 그다음 웹 읽기의 HTML GET을 사용합니다. 모든 수단이 없거나 실패하면 실제 조회 도구 제약을 알리며 셸 호출로 우회하지 않습니다. 웹 읽기는 응답의 실제 링크 ID를 click하고 검색어·지역은 글자 링크로 입력합니다. 새 URL을 조립하지 않습니다.

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

## 웹 읽기만 가능한 채팅 에이전트

샌드박스나 셸 없이 웹 읽기만 가능하면 [웹 조회 시작](https://mcp.aka.page/browse/read)의 실제 링크 ID를 먼저 click합니다. 첫 화면과 llms.txt도 이 시작점을 안내합니다. click이 없는 도구의 동일 동작은 보장하지 않습니다. 결과는 서버에서 생성하므로 JavaScript 실행이 필요 없습니다.

공개 `/browse/` GET 경로는 같은 실제 조회 결과를 항상 HTML로 제공합니다. 쿼리 문자열은 필요 없습니다. 기존 `/api/`의 JSON과 구형 HTML 주소는 하위호환으로 유지합니다. 일반 API 클라이언트용 기본 경로 예시: `/browse/daiso/stores/%EA%B0%95%EB%82%A8`, `/browse/daiso/inventory/%EC%8B%A4%EC%A0%9C%EC%83%81%ED%92%88ID/%ED%99%95%EC%9D%B8%ED%95%9C%EB%A7%A4%EC%9E%A5%EB%AA%85/lat/%ED%99%95%EC%9D%B8%ED%95%9C%EC%9C%84%EB%8F%84/lng/%ED%99%95%EC%9D%B8%ED%95%9C%EA%B2%BD%EB%8F%84`. 상품 목록의 상세 링크도 HTML로 연결합니다. 다른 서비스의 필수 파라미터는 `/prompt`에서 확인합니다.

HTML은 원래 응답의 성공·오류와 HTTP 상태를 보존합니다. 상품 검색 결과를 매장 재고로 단정하거나 오류를 재고 0으로 해석하면 안 됩니다. POST와 MCP 응답 형식은 변경하지 않습니다. 웹 읽기 도구가 HTML 접근도 거부하면 실제 오류를 구분해 기록합니다. 임의 URL open과 실제 링크 click은 이 실험에서 서로 다른 결과를 보였으며 모든 도구·계정에서의 성공을 보장하지 않습니다.

`llms.txt`와 `robots.txt`는 정적 Assets에서도 `text/plain; charset=utf-8`을 명시합니다. UTF-8 본문을 다른 인코딩으로 추측하는 클라이언트에서 한글이 깨지는 것을 방지합니다.

**웹 읽기 전용 에이전트는 검색·상세·매장·재고·후속 조회 모두 `/browse/` 경로를 사용하세요.** `/prompt`의 웹 GET 예시도 이 형식입니다. 쿼리 문자열이나 format 지정은 필요 없습니다. JSON 스키마 예시는 필드 설명이며 일반 JSON API와 MCP 클라이언트 계약은 유지합니다.

## 실행과 이미지 출처

셸 DNS 실패를 웹 GET 실패로 확대하지 않습니다. 실제 URL을 open/WebFetch로 연 결과와 웹 검색을 구분하고 실행하지 않은 요청의 성공·실패나 확인하지 않은 HTTP 상태를 만들지 않습니다. 상품 사진은 해당 응답의 imageUrl만 사용하며 없거나 표시되지 않으면 웹 검색 이미지·다른 상품·다른 국가 이미지로 대체하지 않고 생략합니다.

## 안내 버전과 상품 이미지 카드

현재 안내 버전은 `2026-10-26.1`, 갱신일은 `2026-10-26`입니다. README의 AI 안내, 첫 화면, llms.txt, prompt와 HTML 조회 결과에 표시합니다. 버전이 없거나 다르면 예전 검색 사본일 수 있으므로 실제 읽은 URL과 문구를 확인하고 최신 버전을 읽었다고 추정하지 않습니다. 검색 엔진의 재수집·캐시 반영 시각은 이 배포로 보장하지 않습니다.

상품 HTML은 이름·ID·원본 필드와 응답 imageUrl의 이미지를 같은 카드에 표시합니다. 이미지 링크는 원본 URL의 쿼리까지 유지하며 HTTPS이고 인증정보가 없는 주소만 사용합니다. imageUrl이 없거나 안전한 이미지 주소가 아니면 이미지 없음으로 표시합니다. 검색 이미지로 채우지 않습니다. JSON API 필드와 오류 상태는 유지합니다.

## 최신 안내의 연결 계약

`/guide/latest` 및 이전 `/guide/버전`은 307과 Cache-Control: no-store로 현재 `/guide/2026-10-26.1`에 연결합니다. 새 버전 배포 시 공통 상수와 README·스킬 안내를 함께 갱신합니다. 첫 화면·robots·sitemap도 같은 상수의 현재 경로를 안내합니다. 외부 캐시가 과거 응답이나 리다이렉트를 재사용하는 것까지 강제할 수는 없습니다.

첫 HTML 조회와 상세·재고·페이지 이동 링크는 쿼리 없는 `/browse/` 경로입니다. 프롬프트의 웹 GET 예제도 같은 경로를 사용하며 안내 버전은 `/guide/latest`에서 확인합니다. 안내와 HTML 결과는 no-store를 보내며 기존 JSON/API 원본 캐시 정책은 유지합니다. 이미지 카드에는 원본 imageUrl로 생성한 Markdown을 제공하고 이미지 검색/image_query/캐러셀 대체를 금지합니다. 표시가 불가능하면 원본 링크와 텍스트만 제공합니다.
