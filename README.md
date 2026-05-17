<div align="center">

<img src="./assets/logo.svg" alt="Daiso MCP" width="120" height="120">

<br>
<br>

# Daiso MCP 및 Skill

다이소(제품/매장/재고), 롯데마트(매장/상품), GS25(매장/상품/재고), 세븐일레븐(상품/매장/재고/인기검색어/카탈로그), CU(매장/재고), 이마트24(매장/상품/재고), 올리브영(매장/재고), 메가박스(지점/영화/시간표/좌석), 롯데시네마(지점/영화/좌석), CGV(극장/영화/시간표) 조회 기능을 MCP, CLI, Codex Skill로 AI에 연결합니다.

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-8B5CF6.svg)](https://modelcontextprotocol.io/)
[![Code Coverage](https://img.shields.io/badge/Code%20Coverage-100%25-brightgreen.svg)](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml)
[![Coverage](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml/badge.svg?branch=main)](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v2/monitor/2mmhx.svg)](https://aka-page.betteruptime.com/)

**[실시간 서비스 상태 보기](https://aka-page.betteruptime.com/)**

<!-- WORKERS_INVOCATIONS_CHART:START -->
<h3>Cloudflare Workers 호출량 (2026-03-01 ~ 2026-05-16, 77일)</h3>

<img src="./assets/analytics/workers-invocations.png?v=2026-05-16T15:44:19.119Z" alt="Cloudflare Workers 호출량 그래프 (2026-03-01 ~ 2026-05-16)" width="100%">

<sub>기준 워커: <code>daiso-mcp</code> · 마지막 갱신: 2026-05-17 00:44 KST</sub>

<!-- WORKERS_INVOCATIONS_CHART:END -->

<br>

<br>

<img src="https://i.imgur.com/mPwS4Kv.png" width="400">&nbsp;&nbsp;<img src="https://i.imgur.com/MrndJ3g.png" width="400">

</div>

<br>

---

<br>

## AI 앱에서 MCP 연결하기

ChatGPT, Claude, Grok 같은 AI 앱에서 바로 연결해 사용할 수 있습니다.
아래 앱별 가이드에서 먼저 연동한 뒤 검색/재고/영화 조회를 요청하세요.

<br>

### ![ChatGPT](https://img.shields.io/badge/ChatGPT-74aa9c?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0id2hpdGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTE0Ljk0OSA2LjU0N2EzLjk0IDMuOTQgMCAwIDAtLjM0OC0zLjI3MyA0LjExIDQuMTEgMCAwIDAtNC40LTEuOTM0QTQuMSA0LjEgMCAwIDAgOC40MjMuMiA0LjE1IDQuMTUgMCAwIDAgNi4zMDUuMDg2YTQuMSA0LjEgMCAwIDAtMS44OTEuOTQ4IDQuMDQgNC4wNCAwIDAgMC0xLjE1OCAxLjc1MyA0LjEgNC4xIDAgMCAwLTEuNTYzLjY3OUE0IDQgMCAwIDAgLjU1NCA0LjcyYTMuOTkgMy45OSAwIDAgMCAuNTAyIDQuNzMxIDMuOTQgMy45NCAwIDAgMCAuMzQ2IDMuMjc0IDQuMTEgNC4xMSAwIDAgMCA0LjQwMiAxLjkzM2MuMzgyLjQyNS44NTIuNzY0IDEuMzc3Ljk5NS41MjYuMjMxIDEuMDk1LjM1IDEuNjcuMzQ2IDEuNzguMDAyIDMuMzU4LTEuMTMyIDMuOTAxLTIuODA0YTQuMSA0LjEgMCAwIDAgMS41NjMtLjY4IDQgNCAwIDAgMCAxLjE0LTEuMjUzIDMuOTkgMy45OSAwIDAgMC0uNTA2LTQuNzE2bS02LjA5NyA4LjQwNmEzLjA1IDMuMDUgMCAwIDEtMS45NDUtLjY5NGwuMDk2LS4wNTQgMy4yMy0xLjgzOGEuNTMuNTMgMCAwIDAgLjI2NS0uNDU1di00LjQ5bDEuMzY2Ljc3OHEuMDIuMDExLjAyNS4wMzV2My43MjJjLS4wMDMgMS42NTMtMS4zNjEgMi45OTItMy4wMzcgMi45OTZtLTYuNTMtMi43NWEyLjk1IDIuOTUgMCAwIDEtLjM2LTIuMDFsLjA5NS4wNTdMNS4yOSAxMi4wOWEuNTMuNTMgMCAwIDAgLjUyNyAwbDMuOTQ5LTIuMjQ2djEuNTU1YS4wNS4wNSAwIDAgMS0uMDIyLjA0MUw2LjQ3MyAxMy4zYy0xLjQ1NC44MjYtMy4zMTEuMzM1LTQuMTUtMS4wOThtLS44NS02Ljk0QTMuMDIgMy4wMiAwIDAgMSAzLjA3IDMuOTQ5djMuNzg1YS41MS41MSAwIDAgMCAuMjYyLjQ1MWwzLjkzIDIuMjM3LTEuMzY2Ljc3OWEuMDUuMDUgMCAwIDEtLjA0OCAwTDIuNTg1IDkuMzQyYTIuOTggMi45OCAwIDAgMS0xLjExMy00LjA5NHptMTEuMjE2IDIuNTcxTDguNzQ3IDUuNTc2bDEuMzYyLS43NzZhLjA1LjA1IDAgMCAxIC4wNDggMGwzLjI2NSAxLjg2YTMgMyAwIDAgMSAxLjE3MyAxLjIwNyAyLjk2IDIuOTYgMCAwIDEtLjI3IDMuMiAzLjA1IDMuMDUgMCAwIDEtMS4zNi45OTdWOC4yNzlhLjUyLjUyIDAgMCAwLS4yNzYtLjQ0NW0xLjM2LTIuMDE1LS4wOTctLjA1Ny0zLjIyNi0xLjg1NWEuNTMuNTMgMCAwIDAtLjUzIDBMNi4yNDkgNi4xNTNWNC41OThhLjA0LjA0IDAgMCAxIC4wMTktLjA0TDkuNTMzIDIuN2EzLjA3IDMuMDcgMCAwIDEgMy4yNTcuMTM5Yy40NzQuMzI1Ljg0My43NzggMS4wNjYgMS4zMDMuMjIzLjUyNi4yODkgMS4xMDMuMTkxIDEuNjY0ek01LjUwMyA4LjU3NSA0LjEzOSA3LjhhLjA1LjA1IDAgMCAxLS4wMjYtLjAzN1Y0LjA0OWMwLS41Ny4xNjYtMS4xMjcuNDc2LTEuNjA3cy43NTItLjg2NCAxLjI3NS0xLjEwNWEzLjA4IDMuMDggMCAwIDEgMy4yMzQuNDFsLS4wOTYuMDU0LTMuMjMgMS44MzhhLjUzLjUzIDAgMCAwLS4yNjUuNDU1em0uNzQyLTEuNTc3IDEuNzU4LTEgMS43NjIgMXYybC0xLjc1NSAxLTEuNzYyLTF6Ii8+PC9zdmc+)

> MCP 연동이 어렵다는 피드백이 있어 바로 사용 가능한 GPT 앱을 추가했습니다.
> 아래 링크로 모바일에서도 간편하게 이용 가능합니다!

**[Daiso MCP GPT 앱 바로가기](https://chatgpt.com/g/g-69a5266c32108191b71a24642dc63f9e-daiso-mcp)**

빠른 사용 예시:

```
다이소 mcp로 수납박스 검색해줘
올리브영 mcp로 명동 근처 매장 찾아줘
이마트24 mcp로 강남 근처 매장과 두바이 재고 알려줘
롯데마트 mcp로 잠실 근처 매장 찾아줘
롯데마트 mcp로 강변점에서 콜라 재고 알려줘
GS25 mcp로 강남 근처 매장과 오감자 재고 알려줘
세븐일레븐 mcp로 삼각김밥 검색해줘
세븐일레븐 mcp로 안산 중앙역 근처 매장 찾아줘
세븐일레븐 mcp로 안산 중앙역 근처 세븐일레븐에서 핫식스 재고 알려줘
세븐일레븐 mcp로 인기 검색어와 카탈로그 요약 알려줘
메가박스 mcp로 강남점 영화와 잔여 좌석 알려줘
롯데시네마 mcp로 월드타워 근처 지점과 상영 영화 알려줘
롯데시네마 mcp로 월드타워 잔여 좌석 알려줘
CGV mcp로 강남 상영 영화와 시간표 알려줘
```

<br>

### ![Claude](https://img.shields.io/badge/Claude-D4A27F?logo=anthropic&logoColor=white)

> Pro / Max / Team / Enterprise 플랜 필요 · 웹에서 설정 시 모바일 앱에서도 사용 가능

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
롯데마트 mcp를 사용해서 잠실 근처 매장 찾아줘
롯데마트 mcp를 사용해서 강변점에서 콜라 검색해줘
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

### ![Claude Code](https://img.shields.io/badge/Claude_Code-D4A27F?logo=anthropic&logoColor=white)

> Claude Code CLI에서 MCP 서버 추가

```bash
claude mcp add daiso-mcp https://mcp.aka.page --transport http
```

<br>

### ![Grok](https://img.shields.io/badge/Grok-000000?logo=x&logoColor=white)

> 웹 및 모바일 앱 모두 지원

**프롬프트 페이지 URL:**

```
https://mcp.aka.page/prompt
```

사용 방법:

1. Grok 모바일 앱에서 `https://mcp.aka.page/prompt` 페이지를 읽어달라고 요청
2. 에이전트가 API 사용법을 이해하고 GET 요청으로 기능 실행

예시 대화:

```
사용자: https://mcp.aka.page/prompt 를 읽어줘
AI: (페이지를 읽고 API 사용법 이해)

사용자: 수납박스 검색해줘
AI: (https://mcp.aka.page/api/daiso/products?q=수납박스 호출 후 결과 제공)

사용자: 안산 중앙역 근처 메가박스 지점 찾아줘
AI: (https://mcp.aka.page/api/megabox/theaters?keyword=안산%20중앙역 호출 후 결과 제공)

사용자: 잠실 근처 롯데시네마 지점 찾아줘
AI: (https://mcp.aka.page/api/lottecinema/theaters?keyword=%EC%9E%A0%EC%8B%A4 호출 후 결과 제공)

사용자: 강남 CGV 시간표 알려줘
AI: (https://mcp.aka.page/api/cgv/timetable?playDate=20260304&theaterCode=0056 호출 후 결과 제공)

사용자: 안산 중앙역 근처 CGV 찾아서 오늘 영화랑 시간표 알려줘
AI: (https://mcp.aka.page/api/cgv/theaters?playDate=20260315&keyword=안산%20중앙역 호출 후 결과 제공)
AI: (https://mcp.aka.page/api/cgv/movies?playDate=20260315&keyword=안산%20중앙역 호출 후 결과 제공)
AI: (https://mcp.aka.page/api/cgv/timetable?playDate=20260315&keyword=안산%20중앙역 호출 후 결과 제공)
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
npx daiso cu-stores 강남
npx daiso cu-inventory 과자 --storeKeyword 강남
npx daiso lottemart-stores 잠실 --area 서울 --limit 10
npx daiso lottemart-products 콜라 --storeName 강변점 --area 서울
npx daiso emart24-stores 강남 --service24h true
npx daiso emart24-products 두바이 --pageSize 20
npx daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015
npx daiso gs25-stores 강남 --limit 10
npx daiso gs25-products 오감자 --limit 20
npx daiso gs25-inventory 오감자 --storeKeyword 강남 --storeLimit 10
npx daiso seveneleven-products 삼각김밥 --size 20
npx daiso seveneleven-stores 안산 중앙역 --limit 10
npx daiso get /api/seveneleven/inventory --keyword 핫식스 --storeKeyword 안산%20중앙역 --storeLimit 10
npx daiso seveneleven-popwords --label home
npx daiso seveneleven-catalog --includeIssues true --includeExhibition true --limit 10
npx daiso get /api/cgv/movies --playDate 20260307 --theaterCode 0056

# 원본 JSON 필요 시
npx daiso products 수납박스 --json
```

### Codex Skill

이 저장소는 MCP 서버뿐 아니라 에이전트가 `npx daiso` CLI를 직접 고를 수 있게 하는 Codex Skill도 제공합니다.

- 스킬 파일: `skills/daiso-cli/SKILL.md`
- 명령 맵: `skills/daiso-cli/references/cli-command-map.md`
- 기본 원칙: 쉘 실행이 가능한 환경에서는 CLI를 우선 사용하고, AI 앱 연결이 필요할 때는 MCP 서버 URL `https://mcp.aka.page`를 사용합니다.
- 구조화 결과가 필요하면 스킬은 `npx daiso ... --json` 형태를 선택합니다.

### OpenAPI 스펙

- OpenAI 챗봇 등록용 축약 스펙: `https://mcp.aka.page/openapi.json`
- OpenAI 챗봇 등록용 YAML: `https://mcp.aka.page/openapi.yaml`
- 전체 개별 엔드포인트 스펙(JSON): `https://mcp.aka.page/openapi-full.json`
- 전체 개별 엔드포인트 스펙(YAML): `https://mcp.aka.page/openapi-full.yaml`

### MCP 표준 응답 모델

MCP 도구 응답은 각 서비스의 원본 필드를 유지하면서, 클라이언트가 공통 UI를 만들 수 있도록 `standard` 필드를 함께 제공합니다.

- `standard.products`: 상품/영화 목록을 `code`, `name`, `price`, `imageUrl`, `raw` 형태로 정규화합니다.
- `standard.stores`: 매장 목록을 `code`, `name`, `address`, `distanceMeters`, `raw` 형태로 정규화합니다.
- `standard.theaters`: 영화관 목록을 `code`, `name`, `address`, `distanceMeters`, `raw` 형태로 정규화합니다.

### 운영 헬스 체크

공개 상태 페이지: **[Daiso MCP Status](https://aka-page.betteruptime.com/)**

서비스별 API 상태를 즉시 확인할 때는 `GET /api/health/checks`를 사용합니다. 이 엔드포인트는 `HEALTH_CHECK_SECRET` 환경 변수가 설정되어 있어야 하며, 요청에는 `Authorization: Bearer <secret>` 또는 `x-health-check-key: <secret>` 헤더가 필요합니다. 내부 체크 요청의 기준 URL은 `HEALTH_CHECK_BASE_URL`로 지정할 수 있습니다.

```bash
curl -H "Authorization: Bearer $HEALTH_CHECK_SECRET" \
  "https://mcp.aka.page/api/health/checks?check=lottemart.products&fresh=true&includeSamples=true"
```

주요 쿼리:

- `service=gs25`: 특정 서비스만 확인
- `check=lottemart.products`: 특정 체크만 확인
- `mode=quick|deep`: 체크 모드 선택
- `fresh=true`: 60초 캐시 우회
- `includeSamples=true`: 첫 결과 이름 샘플 포함

배포 전 로컬에서 CLI 모드까지 확인할 때는 아래 명령을 사용합니다.

```bash
npm run cli:smoke
```

기본 `openapi.json`은 OpenAI Actions import 제한에 맞추기 위해 `GET /api/actions/query` 단일 facade만 노출합니다.
기존 서비스별 GET API는 유지되며, 자세한 배경은 [OpenAPI Actions Facade 문서](./docs/openapi-actions-facade.md)에 정리했습니다.

인터랙티브 예시:

```text
$ npx daiso
daiso 인터랙티브 모드

[서비스 선택]
1. 다이소
2. 올리브영
3. CU
서비스 번호를 선택하세요 (0: 종료): 1

매장 검색 키워드를 입력하세요: 강남

[매장 선택]
1. 다이소 강남점 | 서울 강남구 ...
2. 다이소 강남역점 | 서울 강남구 ...
입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 다시 검색
선택: /역점
선택: 1

[선택한 매장 정보]
- 매장명: 다이소 강남역점
- 주소: 서울 강남구 ...
- 전화: 02-...

찾을 상품 키워드를 입력하세요: 수납박스

[상품 선택]
1. 손잡이 수납박스 (2000원, ID: 1034604)
2. 접이식 수납박스 (3000원, ID: 1034605)
입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 취소
선택: 1

[재고 결과]
- 상품: 손잡이 수납박스
- 매장: 다이소 강남역점
- 재고 수량: 7

[다음 동작]
1. 같은 매장에서 다른 상품 찾기
2. 다른 매장/서비스 다시 선택하기
3. 종료하기
번호를 선택하세요: 3
인터랙티브 모드를 종료합니다.
```

<br>

### 미지원 서비스

| 서비스                                                                                                | 상태      |
| :---------------------------------------------------------------------------------------------------- | :-------- |
| ![Gemini](https://img.shields.io/badge/Gemini-8E75B2?logo=googlegemini&logoColor=white) Google Gemini | ❌ 미지원 |
| ![Copilot](https://img.shields.io/badge/Copilot-000000?logo=github&logoColor=white) GitHub Copilot    | ❌ 미지원 |

<br>

## Special Thanks

이 프로젝트에 도움 주신 분들께 감사드립니다.

- [@thecats1105](https://github.com/thecats1105): 다이소 진열 위치 조회 도구(`daiso_get_display_location`) 구현 및 API/테스트 연동
- [@betterthanhajin](https://github.com/betterthanhajin): CGV 서비스 프로바이더 구현(극장/영화/시간표 도구, 라우트·스펙·테스트 추가)
- [제로초님](https://youtube.com/shorts/ZgIqA1NCEp0?si=UW0pKsSpqmEi7lXG): 프로젝트 홍보 도움

<br>

---

<br>

## 상세 문서

`Special Thanks` 이후에 있던 상세 설명은 별도 문서로 분리했습니다.

- [서비스 레퍼런스](./docs/service-reference.md)
- [CONTRIBUTING 가이드](./CONTRIBUTING.md)

<br>

---

<br>

## docs 문서

### 공통 가이드

- [서비스 레퍼런스](./docs/service-reference.md)
- [스크래핑 플레이북](./docs/scraping-playbook.md)
- [mitmproxy 가이드](./docs/mitmproxy-guide.md)
- [AI 지시문](./docs/ai-instruction.md)

### 다이소

- [다이소 네트워크 분석 결과](./docs/daiso-network-analysis-result.md)
- [다이소 Playwright 네트워크 분석](./docs/daiso-playwright-network-analysis.md)
- [다이소 리플레이 세션 테스트 HTML](./docs/daiso-replay-session-test.html)
- [다이소 테스트 리플레이 스크립트](./docs/daiso-test-replay.ts)

### CU

- [CU 네트워크 분석 결과](./docs/cu-network-analysis-result.md)
- [CU 앱 요청 캡처 가이드](./docs/cu-app-request-capture-guide.md)
- [CU 앱 스크래핑 리플레이 가이드](./docs/cu-app-scraping-replay-guide.md)

### 이마트24

- [이마트24 네트워크 분석 결과](./docs/emart24-network-analysis-result.md)
- [이마트24 앱 스크래핑 준비 가이드](./docs/emart24-app-scraping-preparation-guide.md)
- [이마트24 앱 스크래핑 리플레이 가이드](./docs/emart24-app-scraping-replay-guide.md)

### 롯데마트

- [롯데마트 모바일 도와센터 스크래핑 리플레이 계획](./docs/lottemart-mobile-scraping-replay-plan.md)

### 공통

- [OpenAPI Actions facade 리팩토링 배경](./docs/openapi-actions-facade.md)

### 올리브영

- [올리브영 네트워크 분석 결과](./docs/oliveyoung-network-analysis-result.md)
- [올리브영 Playwright MCP 온보딩](./docs/oliveyoung-playwright-mcp-onboarding.md)
- [올리브영 Playwright 네트워크 분석](./docs/oliveyoung-playwright-network-analysis.md)
- [올리브영 Lightpanda 검증](./docs/oliveyoung-lightpanda-validation.md)
- [올리브영 리플레이 세션 테스트 스크립트](./docs/oliveyoung-replay-session-test.ts)
- [올리브영 Zyte 대역폭 테스트](./docs/oliveyoung-zyte-bandwidth-test.ts)
- [올리브영 Zyte 리플레이 테스트](./docs/oliveyoung-zyte-replay-test.ts)

### 영화관

- [CGV 네트워크 분석 결과](./docs/cgv-network-analysis-result.md)
- [메가박스 네트워크 분석 결과](./docs/megabox-network-analysis-result.md)
- [롯데시네마 네트워크 분석 결과](./docs/lottecinema-network-analysis-result.md)

### GS25

- [GS25 API 리플레이 방법론 (최종)](./docs/gs25-final-replay-methodology.md)
- [GS25 네트워크 분석 결과 (아카이브)](./docs/archive/gs25-network-analysis-result.md)
- [GS25 안드로이드 우회 캡처 가이드 (아카이브)](./docs/archive/gs25-android-bypass-capture-guide.md)
- [GS25 앱 캡처 시도 로그 (2026-03-08, 아카이브)](./docs/archive/gs25-app-capture-attempt-log-20260308.md)
- [GS25 앱 스크래핑 준비 가이드 (아카이브)](./docs/archive/gs25-app-scraping-preparation-guide.md)
- [GS25 세션 인계 문서 (2026-03-09, 아카이브)](./docs/archive/gs25-session-handoff-20260309.md)

<br>

---

<div align="center">

<br>

MIT License

<br>

</div>

---

## 신규 MCP 기능 추가 시 유의사항

새로운 서비스나 도구를 추가할 때는 구현만 끝내지 말고 아래 반영 범위를 함께 확인해야 합니다.

- `MCP`: `src/index.ts` 서비스 등록, 루트 서비스/도구 목록, 관련 테스트 반영
- `HTTPS`: GET API 핸들러/라우트, 프롬프트 페이지(`src/pages/prompt.ts`), 앱 통합 테스트 반영
- `CLI`: `src/cli.ts`, `src/cliHelp.ts`, CLI 테스트 반영
- `AI instruction`: [ai-instruction.md](./docs/ai-instruction.md) 사용 규칙/워크플로우 반영
- `README`: 지원 서비스 설명, 예시, 문서 링크 반영
- `OpenAPI`: 기본 `/openapi.json` facade 스펙, `/openapi-full.json` 전체 스펙, 관련 테스트 반영

기능 추가 후 최소 검증 기준:

- `npm run typecheck`
- `npm test`
