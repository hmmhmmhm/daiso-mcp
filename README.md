# Daiso MCP 및 Skill

다이소·편의점 재고, 주변 장소, 주유소 가격, 영화 시간표를 AI에서 조회합니다.
**공개 원격 MCP에 연결하면 로컬 설치·빌드·API 키 준비 없이 바로 사용할 수 있습니다.**
에이전트는 [짧은 시작 안내](https://mcp.aka.page/llms.txt)를 참고하세요. 무설치 요청에는 npm 설치나 전체 스키마 탐색이 필요하지 않습니다.

## 원격 MCP로 바로 시작하기

| 연결 항목 | 값                                  |
| :-------- | :---------------------------------- |
| 서버 URL  | `https://mcp.aka.page`              |
| 전송 방식 | Streamable HTTP (`http`)            |
| 인증      | 없음: API 키·토큰·OAuth 설정 불필요 |

1. 사용하는 AI 앱의 **원격 MCP 서버 추가** 화면을 엽니다.
2. 위 URL을 입력하고 전송 방식을 묻는 경우 **HTTP / Streamable HTTP**를 선택합니다.
3. 연결된 도구를 활성화하고 아래 첫 조회를 요청합니다.

```text
다이소 mcp로 수납박스 검색해줘
```

에이전트가 `daiso_search_products`에 `{"query":"수납박스"}`를 전달하고
상품 목록과 가격을 반환하면 연결이 완료된 것입니다.
앱별 화면은 [연결 가이드](docs/client-guide.md#원격-mcp-연결)를 참고하세요.

### HTTP POST로 첫 MCP 조회

HTTP POST를 실행할 수 있는 에이전트나 터미널에서는 로컬 패키지 설치 없이 호출합니다.
이 서버의 루트 POST는 initialize 없이 `tools/call`을 지원합니다.

```bash
curl -sS -N --max-time 20 'https://mcp.aka.page/' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"daiso_search_products","arguments":{"query":"수납박스","pageSize":1}}}'
```

응답의 SSE `data:` 안에 `error`와 `result.isError: true`가 없고,
`result.structuredContent` 또는 `result.content`에 상품 결과가 있으면 성공입니다.
일반 MCP 클라이언트의 initialize 흐름은 그대로 지원하며 `/mcp` 경로는 initialize가 필요합니다.

### Claude Code

이미 Claude Code를 사용한다면 다음 한 줄로 공개 서버를 등록합니다.

```bash
claude mcp add daiso-mcp https://mcp.aka.page --transport http
```

새 대화에서 `다이소 mcp로 수납박스 검색해줘`를 요청하세요.

### 더 해볼 수 있는 조회

```text
다이소 mcp로 강남역 근처 매장 찾아줘
GS25 mcp로 강남 근처 오감자 재고 알려줘
콜라 어디가 싼지 비교해줘
오늘 강남 CGV 시간표 알려줘
```

재고 조회는 먼저 상품을 검색해 ID를 확인한 뒤 진행합니다.
자세한 선택 규칙은 [AI 지시문](docs/ai-instruction.md)에 있습니다.

## 지원 서비스

| 분류      | 서비스                              | 주요 조회               |
| :-------- | :---------------------------------- | :---------------------- |
| 리테일    | 다이소, 올리브영                    | 상품·매장·재고          |
| 편의점    | GS25, 세븐일레븐, CU, 이마트24      | 상품·매장·재고          |
| 가격 비교 | 다이소, GS25, 세븐일레븐, 이마트24  | 같은 상품의 가격 후보   |
| 장소·유가 | 네이버 지역 검색, 오피넷            | 카페·음식점·주유소·유가 |
| 영화관    | CGV, 메가박스, 롯데시네마, 디트릭스 | 지점·영화·시간표·좌석   |

서비스별 지원 범위와 입력은 [서비스 레퍼런스](docs/service-reference.md)와
[디트릭스 가이드](docs/dtryx.md)를 참고하세요.
롯데마트는 지원이 종료되었습니다. 과거 분석과 호환 경로만 보존합니다.

## MCP 연결을 사용할 수 없는 환경

에이전트가 웹페이지를 읽고 GET 요청을 실행할 수 있다면
[REST 사용법 페이지](https://mcp.aka.page/prompt)를 읽은 뒤 조회할 수 있습니다.
이 경로는 HTTP GET 기반 REST이며 원격 MCP 연결과 별개의 대안입니다.

터미널에서는 Node.js 환경이 있을 때 다음 명령으로 조회할 수 있습니다.

```bash
npx daiso products 수납박스 --json
```

CLI는 로컬 npm 패키지를 실행합니다. 공개 원격 MCP 연결에는 이 명령이 필요하지 않습니다.
앱·CLI·OpenAPI 대안은 [연결 가이드](docs/client-guide.md)에 있습니다.

### Codex Skill

에이전트가 CLI 명령을 선택하도록 하는 [Skill](skills/daiso-cli/SKILL.md)도 제공합니다.
`clawhub install daiso-cli` 설치와 사용 예시는 [연결 가이드](docs/client-guide.md#codex-skill)에 있습니다.

## 응답과 이용 제한

도구 응답은 원본 필드와 함께 공통 결과를 제공합니다.
`standard.products`는 상품, `standard.stores`는 매장,
`standard.theaters`는 영화관 목록입니다.
[응답 모델](docs/service-reference.md#mcp-표준-응답-모델)에서 필드 정의를 확인하세요.

공개 GET API 중 올리브영·CGV·CU·GS25에는 IP당 하루 합산 3,000회(KST 기준) 제한이 적용됩니다.
조회가 실패하면 [서비스 상태](https://aka-page.betteruptime.com/)를 확인하세요.
서버 운영과 제한 집계는 [운영 가이드](scripts/ops/README.md)에 있습니다.

## 상세 문서

이전 README 절의 링크는 아래 상세 가이드로 이어집니다.

<a id="ai-앱에서-mcp-연결하기"></a><a id="chatgpt"></a><a id="claude"></a><a id="claude-code"></a><a id="home-assistant"></a><a id="grok"></a><a id="바로-실행해보기"></a><a id="mcp-서버-url--cli-고급"></a><a id="openapi-스펙"></a><a id="미지원-서비스"></a>

- [앱 연결·CLI·Skill·OpenAPI](docs/client-guide.md)
  <a id="mcp-표준-응답-모델"></a><a id="통합-상품-가격-비교"></a><a id="오피넷-유가-정보"></a><a id="개발자-요청-제출"></a><a id="무료-위치-검색"></a><a id="신규-mcp-기능-추가-시-유의사항"></a>

- [서비스 도구·REST API·아키텍처](docs/service-reference.md)
- [AI 도구 선택·조회 흐름](docs/ai-instruction.md)
- [개발·설치·직접 배포](CONTRIBUTING.md)
  <a id="운영-헬스-체크"></a><a id="운영-통계"></a>

- [서버 운영·헬스 체크·요청량 차트](scripts/ops/README.md)
  <a id="docs-문서"></a>

- [서비스 분석 문서](docs/service-reference.md#분석-문서)

## Special Thanks

- [@thecats1105](https://github.com/thecats1105): 다이소 진열 위치 조회
- [@betterthanhajin](https://github.com/betterthanhajin): CGV 서비스
- [@LLagoon3](https://github.com/LLagoon3): 다이소 재고 인증
- [제로초님](https://youtube.com/shorts/ZgIqA1NCEp0?si=UW0pKsSpqmEi7lXG): 프로젝트 홍보

MIT License
