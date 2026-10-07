# 앱 연결·CLI·Skill 가이드

[무설치 원격 MCP 첫 조회](../README.md#원격-mcp로-바로-시작하기)부터 시작하세요.
원격 서버는 `https://mcp.aka.page`, 전송 방식은 Streamable HTTP, 사용자 인증은 없습니다.

## 원격 MCP 연결

Claude, Claude Code, Home Assistant 등 원격 MCP를 지원하는 앱에서 연결할 수 있습니다.
ChatGPT GPT 앱과 Grok의 GET 조회는 아래 REST 대안으로 구분합니다.
아래 앱별 가이드에서 먼저 연동한 뒤 검색/재고/영화 조회를 요청하세요.

<br>

### ChatGPT GPT 앱 (REST 대안)

> MCP 연동이 어렵다는 피드백이 있어 바로 사용 가능한 GPT 앱을 추가했습니다.
> 이용 가능한 환경과 조건은 현재 ChatGPT 앱에서 확인하세요.

**[Daiso MCP GPT 앱 바로가기](https://chatgpt.com/g/g-69a5266c32108191b71a24642dc63f9e-daiso-mcp)**

빠른 사용 예시:

```
다이소 mcp로 수납박스 검색해줘
콜라 어디가 싼지 비교해줘
올리브영 mcp로 명동 근처 매장 찾아줘
이마트24 mcp로 강남 근처 매장과 두바이 재고 알려줘
GS25 mcp로 강남 근처 매장과 오감자 재고 알려줘
세븐일레븐 mcp로 삼각김밥 검색해줘
세븐일레븐 mcp로 안산 중앙역 근처 매장 찾아줘
세븐일레븐 mcp로 안산 중앙역 근처 세븐일레븐에서 핫식스 재고 알려줘
세븐일레븐 mcp로 인기 검색어와 카탈로그 요약 알려줘
강남역 근처 카페 찾아줘
성수동 근처 브런치 음식점 찾아줘
강남역 근처 제일 싼 주유소 찾아줘
오늘 전국 평균 휘발유 가격 알려줘
메가박스 mcp로 강남점 영화와 잔여 좌석 알려줘
롯데시네마 mcp로 월드타워 근처 지점과 상영 영화 알려줘
롯데시네마 mcp로 월드타워 잔여 좌석 알려줘
CGV mcp로 강남 상영 영화와 시간표 알려줘
```

에이전트가 고르면 좋은 대표 흐름:

- 가격 비교: `콜라 어디가 싸?` → `compare_products`
- 주변 장소: `강남역 근처 카페 찾아줘` → `places_search_nearby`
- 주유소/유가: `강남역 근처 제일 싼 주유소 찾아줘` → `opinet_search_stations_around`
- 브랜드 명시 재고: `다이소 핫식스 재고 찾아줘` → 먼저 다이소에서 검색 후 결과 없을 때만 대안 제안
- 편의점 재고: `GS25 강남 오감자 재고` → 상품 후보 확인 후 재고 조회
- 영화 시간표: `오늘 강남 CGV 시간표` → KST 오늘 날짜로 극장 검색 후 시간표 조회
- 개발자 요청: `올리브영 재고 도구가 계속 실패한다고 개발자에게 알려줘` → `submit_developer_request`

<br>

### Claude

> 연결 메뉴와 이용 조건은 [Claude 공식 연결 가이드](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)에서 확인하세요.

1. [claude.ai](https://claude.ai)에서 **Settings** → **Connectors** 이동
2. **Add custom connector** 클릭
3. 원격 MCP 서버 URL 입력: `https://mcp.aka.page`
4. **Add** 클릭하여 완료
5. 대화창에서 **+** 버튼 → **Connectors** → 토글로 활성화

사용 예시:

```
다이소 mcp를 사용해서 수납박스 검색해줘
다이소 mcp를 사용해서 강남역 근처 매장 찾아줘
올리브영 mcp를 사용해서 명동 근처 매장 찾아줘
올리브영 mcp를 사용해서 선크림 재고 확인해줘
이마트24 mcp를 사용해서 강남 매장 찾고 두바이 재고 확인해줘
GS25 mcp를 사용해서 강남 매장 찾고 오감자 재고 확인해줘
세븐일레븐 mcp를 사용해서 안산 중앙역 근처 매장 찾고 핫식스 재고 확인해줘
메가박스 mcp를 사용해서 강남역 근처 지점 찾아줘
메가박스 mcp를 사용해서 강남점 영화 목록이랑 잔여 좌석 확인해줘
롯데시네마 mcp를 사용해서 잠실 근처 지점 찾아줘
롯데시네마 mcp를 사용해서 월드타워 영화 목록이랑 잔여 좌석 확인해줘
CGV mcp를 사용해서 서울 지역 극장 목록 찾아줘
CGV mcp를 사용해서 강남 CGV 영화랑 시간표 확인해줘
```

참고: [Claude Remote MCP 가이드](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

<br>

### Claude Code

> Claude Code CLI에서 MCP 서버 추가

```bash
claude mcp add daiso-mcp https://mcp.aka.page --transport http
```

<br>

### Home Assistant

> 과거 검증 환경은 Home Assistant Core 2026.7.1입니다. 현재 제공 도구는 서버의 `tools/list`로 확인하세요.

1. Home Assistant에서 **Settings** → **Devices & services**로 이동
2. **Add Integration**을 선택하고 **Model Context Protocol**을 검색
3. 서버 URL 입력: `https://mcp.aka.page`
4. 연동을 마친 뒤 사용할 대화 에이전트가 MCP 도구를 사용하도록 설정

참고: [Home Assistant Model Context Protocol 통합 가이드](https://www.home-assistant.io/integrations/mcp)

<br>

### Grok (REST 대안)

> 사용할 앱에서 웹페이지 읽기와 GET 요청 실행을 지원하는지 현재 앱 문서를 확인하세요.

**프롬프트 페이지 URL:**

```
https://mcp.aka.page/prompt
```

사용 방법:

1. Grok 모바일 앱에서 `https://mcp.aka.page/prompt` 페이지를 읽어달라고 요청
2. 에이전트가 API 사용법을 이해하고 GET 요청으로 기능 실행

예시 대화 (`YYYYMMDD`는 실행일의 KST 날짜로 바꿉니다):

```
사용자: https://mcp.aka.page/prompt 를 읽어줘
AI: (페이지를 읽고 API 사용법 이해)

사용자: 수납박스 검색해줘
AI: (https://mcp.aka.page/api/daiso/products?q=수납박스 호출 후 결과 제공)

사용자: 안산 중앙역 근처 메가박스 지점 찾아줘
AI: (https://mcp.aka.page/api/megabox/theaters?keyword=안산%20중앙역 호출 후 결과 제공)

사용자: 잠실 근처 롯데시네마 지점 찾아줘
AI: (https://mcp.aka.page/api/lottecinema/theaters?keyword=%EC%9E%A0%EC%8B%A4 호출 후 결과 제공)

사용자: 오늘 강남 CGV 시간표 알려줘
AI: (https://mcp.aka.page/api/cgv/timetable?playDate=YYYYMMDD&theaterCode=0056 호출 후 결과 제공)

사용자: 안산 중앙역 근처 CGV 찾아서 오늘 영화랑 시간표 알려줘
AI: (https://mcp.aka.page/api/cgv/theaters?playDate=YYYYMMDD&keyword=안산%20중앙역 호출 후 결과 제공)
AI: (https://mcp.aka.page/api/cgv/movies?playDate=YYYYMMDD&keyword=안산%20중앙역 호출 후 결과 제공)
AI: (https://mcp.aka.page/api/cgv/timetable?playDate=YYYYMMDD&keyword=안산%20중앙역 호출 후 결과 제공)
```

<br>

### 바로 실행해보기

Node.js 환경이 있는 터미널에서 npm 패키지를 실행하는 대안입니다. 원격 MCP 연결에는 설치가 필요하지 않습니다.

```bash
npx daiso products 수납박스 --json
npx daiso places 강남역 --category cafe --limit 5 --json
npx daiso gs25-inventory 오감자 --storeKeyword 강남 --storeLimit 5 --json
npx daiso cgv-movies --playDate "$(TZ=Asia/Seoul date +%Y%m%d)" --theaterCode 0056 --json
```

<br>

### MCP 서버 URL / CLI (고급)

AI 앱 대신 직접 연결하거나 스크립트에서 사용할 때만 참고하세요.

MCP 서버 URL:

```
https://mcp.aka.page
```

CLI (npx):

```bash
# 인터랙티브 모드 (추천)
npx daiso

# 인터랙티브 비활성화 (CI/스크립트)
npx daiso --non-interactive

# 명령형 모드
npx daiso help
npx daiso help products
npx daiso url
npx daiso health
npx daiso claude

# AI 없이 직접 조회
npx daiso products 수납박스
npx daiso product 1034604
npx daiso stores 강남역
npx daiso inventory 1034604 --keyword 강남역
npx daiso display-location 1034604 04515
npx daiso compare 콜라 --limit 3
npx daiso places 강남역 --category cafe --limit 5
npx daiso places 성수동 --keyword 브런치 --limit 5
npx daiso get /api/opinet/lowest --fuelCode B027 --areaCode 0113 --count 5 --json
npx daiso get /api/opinet/average --json
npx daiso cu-stores 강남
npx daiso cu-inventory 과자 --storeKeyword 강남
npx daiso cgv-theaters 강남 --limit 10
npx daiso cgv-movies --playDate "$(TZ=Asia/Seoul date +%Y%m%d)" --theaterCode 0056
npx daiso cgv-timetable --playDate "$(TZ=Asia/Seoul date +%Y%m%d)" --theaterCode 0056
npx daiso emart24-stores 강남 --service24h true
npx daiso emart24-products 두바이 --pageSize 20
npx daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015
npx daiso gs25-stores 강남 --limit 10
npx daiso gs25-products 오감자 --limit 20
npx daiso gs25-inventory 오감자 --storeKeyword 강남 --storeLimit 10
npx daiso seveneleven-products 삼각김밥 --size 20
npx daiso seveneleven-stores 안산 중앙역 --limit 10
npx daiso seveneleven-inventory 핫식스 --storeKeyword "안산 중앙역" --storeLimit 10
npx daiso seveneleven-popwords --label home
npx daiso seveneleven-catalog --includeIssues true --includeExhibition true --limit 10

# 원본 JSON 필요 시
npx daiso products 수납박스 --json
```

### Codex Skill

이 저장소는 MCP 서버뿐 아니라 에이전트가 `npx daiso` CLI를 직접 고를 수 있게 하는 Codex Skill도 제공합니다.

- ClawHub: `clawhub install daiso-cli`
- 공개 페이지: `https://clawhub.ai/hmmhmmhm/daiso-cli`
- 스킬 파일: [skills/daiso-cli/SKILL.md](../skills/daiso-cli/SKILL.md)
- 명령 맵: [CLI 명령 맵](../skills/daiso-cli/references/cli-command-map.md)
- 사용자가 무설치 조회를 요청하면 공개 원격 MCP 또는 HTTP POST를 우선 사용합니다. `npx`나 Skill 설치, 전체 스키마 탐색은 필요하지 않습니다.
- CLI를 사용하기로 선택했고 쉘 실행이 가능한 환경에서만 `npx daiso`를 사용합니다. AI 앱 연결에는 MCP 서버 URL `https://mcp.aka.page`를 사용합니다.
- 구조화 결과가 필요하면 스킬은 `npx daiso ... --json` 형태를 선택합니다.
- 상황별 레시피는 `콜라 어디가 싸?`, `강남역 근처 카페`, `다이소 핫식스 재고`, `오늘 강남 CGV 시간표`처럼 실제 사용자 문장 기준으로 정리되어 있습니다.

### OpenAPI 스펙

- OpenAI 챗봇 등록용 축약 스펙: `https://mcp.aka.page/openapi.json`
- OpenAI 챗봇 등록용 YAML: `https://mcp.aka.page/openapi.yaml`
- 전체 개별 엔드포인트 스펙(JSON): `https://mcp.aka.page/openapi-full.json`
- 전체 개별 엔드포인트 스펙(YAML): `https://mcp.aka.page/openapi-full.yaml`

기본 OpenAPI 스펙은 OpenAI Actions용 `GET /api/actions/query` 단일 facade를 노출합니다.
기존 서비스별 GET 경로는 유지하며 [facade 배경](./openapi-actions-facade.md)을 참고하세요.

## 연결할 수 없는 앱

앱의 원격 MCP 지원 여부는 해당 앱 문서에서 확인하세요. 웹 GET 요청을 실행할 수 있다면
[REST 사용법 페이지](https://mcp.aka.page/prompt)를 읽고 조회할 수 있습니다.
REST GET 조회는 MCP 프로토콜 연결이 아닙니다.
