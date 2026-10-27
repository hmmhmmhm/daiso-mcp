<details>
<summary>AI 에이전트 사용 안내</summary>

> [!IMPORTANT]
> **최신 안내:** [현재 버전](https://mcp.aka.page/guide/2026-10-27.1) · [항상 최신 버전으로 이동](https://mcp.aka.page/guide/latest)
>
> **안내 버전: 2026-10-27.1 · 갱신일: 2026-10-27**
>
> **웹 읽기는 실제 링크 ID로 click하세요.** 새 검색 URL을 조립해 open하지 말고 [원하는 검색어를 글자로 선택](https://mcp.aka.page/browse/compose/daiso/products/~)하세요. 상품의 **매장 지역 선택** 링크에서 지역도 선택할 수 있습니다. 입력 중에는 원본 조회를 실행하지 않습니다. click이 없는 도구의 동일 동작은 보장하지 않습니다.
>
> **ChatGPT 웹 조회:** 연결된 MCP 도구가 없으면 사용 가능한 실제 브라우저로, 브라우저 도구도 없으면 open/WebFetch로 [HTML GET으로 바로 조회](https://mcp.aka.page/browse/daiso/products/%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4/pageSize/3)하세요. 설치·API 키·MCP 연결 설정은 필요 없습니다.
>
> **로컬 설치·빌드·API 키 준비 없이 실제 조회부터 실행하세요.** 패키지 설치나 전체 스키마 탐색은 필요 없습니다.
>
> 1. 연결된 MCP 도구가 있으면 `search_products`에 `{"service":"daiso","query":"수납박스","pageSize":3}`를 전달합니다.
> 2. 실제 브라우저 도구가 있으면 /browse/ HTML GET 주소를 열고 실제 상품·매장·재고를 읽습니다. Work의 내장 브라우저도 사용 가능합니다.
> 3. 웹 읽기(open/WebFetch)만 가능하면 응답의 실제 링크 ID로 click합니다. 위 글자 선택 링크로 임의 검색어와 지역을 입력하고 실제 상품·재고 조회 링크를 따르세요. 새 URL 조립과 실패한 직접 open을 반복하지 마세요. Crawled가 과거인 수집본을 현재 재고로 단정하지 마세요.
> 4. 위 세 수단이 없거나 모두 실패하면 실제 조회 제약과 오류를 알립니다. 셸이 있어도 설치 없는 웹 조회가 우선이며 터미널·셸로 우회하지 않습니다. 셸 DNS 오류를 웹 GET 실패로 확대하거나 실행하지 않은 요청의 실패를 만들지 마세요.
>
> **검색 링크:** [핫식스 상품 검색](https://mcp.aka.page/browse/daiso/products/%ED%95%AB%EC%8B%9D%EC%8A%A4/pageSize/10) · [강남 매장 검색](https://mcp.aka.page/browse/daiso/stores/%EA%B0%95%EB%82%A8). 웹 읽기는 링크를 직접 열고, 접근 오류만으로 상품 없음이나 재고 0을 판단하지 마세요.
>
> **실행 근거:** 실제 데이터·도구·오류만 보고하고 실행하지 않은 요청의 성공·실패를 만들지 마세요. REST GET 성공은 MCP 연결 성공과 구분합니다.
>
> **상품 이미지:** 해당 응답의 `imageUrl`과 카드에 제공된 원본 이미지 Markdown만 사용하세요. `image_query`·이미지 검색·검색 캐러셀은 사용하지 마세요. 원본 표시가 불가능하면 링크나 텍스트만 제공합니다. 없거나 표시되지 않으면 생략하고 웹 검색 이미지·다른 상품·다른 국가의 이미지로 대체하지 마세요.
>
> **MCP 도구는 10개 고정:** `service`와 `operation`으로 지원 서비스를 선택합니다. 새 연동은 [통합 도구 10개](docs/mcp-tools.md)만 사용하세요. 기존 서비스별 도구는 deprecated 호출 별칭으로 유지하지만 목록에는 표시하지 않습니다.
>
> **웹 읽기 전용 에이전트는 `/browse/`의 실제 링크만 선택하세요.** 검색·상세·매장·재고·후속 조회가 모두 자동 HTML이며 쿼리 문자열이나 `format` 지정은 필요 없습니다. 검색어·지역은 글자 링크로 입력하고 응답의 상세·재고 링크를 따르세요. 일반 API 클라이언트의 필터 문법은 상세 사용 안내를 참고하세요.
>
> [첫 HTML 조회](https://mcp.aka.page/browse/daiso/products/%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4/pageSize/3) · [REST 사용법](https://mcp.aka.page/prompt) · [원격 MCP 연결](#원격-mcp로-바로-시작하기)

</details>

[![MCP Toplist](https://mcptoplist.com/badge/glama%2Fhmmhmmhm%2Fdaiso-mcp.svg)](https://mcptoplist.com/server/glama%2Fhmmhmmhm%2Fdaiso-mcp)

<div align="center">

# DAISO MCP

다이소·편의점 재고와 생활 정보를 AI에서 바로 조회하세요.

설치·API 키 없이 연결하는 공개 MCP

**[바로 시작하기](#원격-mcp로-바로-시작하기)** · [CLI·Skill](#cli와-skill) · [사용 예시](#이렇게-물어보세요)

<img src="./assets/daiso-mcp-services.png" alt="햄스터와 함께 둘러보는 DAISO MCP 지원 서비스: 한국·일본 다이소, 올리브영, GS25, CU, 세븐일레븐, 이마트24, CGV, 메가박스, 롯데시네마, 디트릭스, 네이버 장소 검색, 오피넷" width="100%">

<h3>지원 서비스</h3>

<table>
  <thead>
    <tr>
      <th>분류</th>
      <th>서비스</th>
      <th>주요 기능</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>생활용품·뷰티</td>
      <td>다이소, 올리브영</td>
      <td>상품·매장·재고</td>
    </tr>
    <tr>
      <td>편의점</td>
      <td>GS25, CU, 세븐일레븐, 이마트24</td>
      <td>상품·매장·재고</td>
    </tr>
    <tr>
      <td>일본</td>
      <td>일본 다이소</td>
      <td>온라인 상품·엔화 가격·매장 (매장 재고 미지원)</td>
    </tr>
    <tr>
      <td>영화관</td>
      <td>CGV, 메가박스, 롯데시네마, 디트릭스</td>
      <td>시간표·잔여 좌석</td>
    </tr>
    <tr>
      <td>주변 정보</td>
      <td>네이버 지역 검색, 오피넷</td>
      <td>주변 장소·주유소 가격</td>
    </tr>
  </tbody>
</table>

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-8B5CF6.svg)](https://modelcontextprotocol.io/)
[![Uses ALIGNS.md](https://raw.githubusercontent.com/hmmhmmhm/aligns.md/main/assets/badges/uses-aligns.svg)](https://github.com/hmmhmmhm/aligns.md)
[![Code Coverage](https://img.shields.io/badge/Code%20Coverage-100%25-brightgreen.svg)](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml)
[![Coverage](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml/badge.svg?branch=main)](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v2/monitor/2mmhx.svg)](https://aka-page.betteruptime.com/)

**[실시간 서비스 상태 보기](https://aka-page.betteruptime.com/)**

<!-- WORKERS_INVOCATIONS_CHART:START -->
<h3>Cloudflare 요청 수 (2026-09-27 ~ 2026-10-26, 30일)</h3>

<img src="./assets/analytics/workers-invocations.png?v=2026-10-26T20:32:32.797Z" alt="Cloudflare 요청 수 그래프 (2026-09-27 ~ 2026-10-26)" width="100%">

<sub>기준 워커: <code>daiso-mcp</code> · 마지막 갱신: 2026-10-27 05:32 KST</sub>
<br><sub>집계: Worker 실행 + 루트 GET 리디렉션 요청 · 사용자 수와 다릅니다.</sub>

</div>

<div align="center">

<!-- WORKERS_INVOCATIONS_CHART:END -->

</div>

<br>

---

## 원격 MCP로 바로 시작하기

원격 MCP를 지원하는 AI 앱에서 서버를 추가하면 설치·API 키 없이 사용할 수 있습니다.

| 연결 항목 | 값                       |
| :-------- | :----------------------- |
| 서버 URL  | `https://mcp.aka.page`   |
| 전송 방식 | Streamable HTTP (`http`) |
| 인증      | 없음                     |

1. AI 앱의 **원격 MCP 서버 추가** 화면을 엽니다.
2. 서버 URL을 입력하고, 전송 방식을 묻는 경우 **HTTP / Streamable HTTP**를 선택합니다.
3. 도구를 활성화하고 `다이소 MCP로 수납박스 검색해줘`라고 요청합니다.

[앱별 연결 방법](docs/client-guide.md#원격-mcp-연결) · [WebFetch로 첫 조회](docs/service-reference.md?guide=2026-10-27.1#설치-없이-첫-조회)

<p align="center">
  <img src="./assets/readme-banners/connect.webp" alt="스마트폰과 노트북을 클라우드로 연결하는 두 햄스터" width="100%">
</p>

<a id="codex-skill"></a>

## CLI와 Skill

Node.js가 있는 터미널에서는 다음 명령으로 조회할 수 있습니다.

```bash
npx daiso products 수납박스 --json
```

에이전트용 [DAISO CLI Skill](https://clawhub.ai/hmmhmmhm/daiso-cli)도 제공합니다.
설치는 `clawhub install daiso-cli`이며, [CLI·Skill 가이드](docs/client-guide.md#codex-skill)에서 자세한 사용법을 확인할 수 있습니다.
원격 MCP만 사용한다면 CLI나 Skill을 설치할 필요가 없습니다.

<p align="center">
  <img src="./assets/readme-banners/cli-skill.webp" alt="터미널과 작업 카드를 이용해 조회하는 햄스터" width="100%">
</p>

<a id="mcp-연결을-사용할-수-없는-환경"></a>

## 웹으로 조회하기

MCP 연결 없이 웹 읽기와 GET 요청을 지원하는 에이전트는 [REST 사용법](https://mcp.aka.page/prompt)을 읽고 조회할 수 있습니다.
**상품·매장·재고와 모든 후속 조회는 `/browse/` 경로를 사용하세요.** 자동 HTML이며 쿼리 문자열은 필요 없습니다.

[수납박스 검색해 보기](https://mcp.aka.page/browse/daiso/products/%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4/pageSize/3)

<p align="center">
  <img src="./assets/readme-banners/web.webp" alt="브라우저 검색 결과에서 매장을 찾아가는 햄스터" width="100%">
</p>

<a id="더-해볼-수-있는-조회"></a>

## 이렇게 물어보세요

```text
다이소 수납박스 찾아줘
강남역 근처 GS25 오감자 재고 알려줘
주변에서 휘발유가 가장 저렴한 주유소 찾아줘
오늘 강남 CGV 시간표 알려줘
```

`콜라 어디가 싼지 비교해줘`처럼 판매처별 가격 후보도 비교할 수 있습니다.
재고 조회는 상품을 검색해 정확한 상품을 선택한 뒤 진행합니다.

<p align="center">
  <img src="./assets/readme-banners/examples.webp" alt="생활용품과 간식, 영화 정보를 찾아 동네를 둘러보는 햄스터" width="100%">
</p>

<a id="응답과-이용-제한"></a>

## 이용 안내

- 재고와 잔여 좌석은 조회 후 달라질 수 있습니다. 미확인 결과는 품절이나 재고 0과 구분합니다.
- 일본 다이소는 온라인 상품·가격·매장 검색을 지원하며, **일본 매장 재고는 미지원**입니다.
- 조회가 실패하면 [서비스 상태](https://aka-page.betteruptime.com/)를 확인하세요. 롯데마트는 지원이 종료되었습니다.

<p align="center">
  <img src="./assets/readme-banners/guidance.webp" alt="확인 목록과 시계로 조회 상태와 시점을 살펴보는 햄스터" width="100%">
</p>

<a id="일본-다이소"></a><a id="http-post로-첫-mcp-조회"></a>

## 상세 문서

<a id="mcp-표준-응답-모델"></a><a id="통합-상품-가격-비교"></a><a id="오피넷-유가-정보"></a><a id="개발자-요청-제출"></a><a id="무료-위치-검색"></a><a id="신규-mcp-기능-추가-시-유의사항"></a><a id="운영-헬스-체크"></a><a id="운영-통계"></a><a id="docs-문서"></a>

<a id="ai-앱에서-mcp-연결하기"></a><a id="chatgpt"></a><a id="claude"></a><a id="claude-code"></a><a id="home-assistant"></a><a id="grok"></a><a id="바로-실행해보기"></a><a id="mcp-서버-url--cli-고급"></a><a id="openapi-스펙"></a><a id="미지원-서비스"></a>

| 문서                                                            | 내용                                                                                                                                               |
| :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| [연결·사용 가이드](docs/client-guide.md)                        | 앱별 MCP 연결, CLI, Skill, OpenAPI                                                                                                                 |
| [서비스 레퍼런스](docs/service-reference.md?guide=2026-10-27.1) | 서비스별 도구·REST API·응답 모델·가격 비교                                                                                                         |
| [일본 다이소](docs/daiso-jp-network-analysis.md)                | 일본 상품·매장 검색과 지원 범위                                                                                                                    |
| [독립·예술영화관](docs/dtryx.md)                                | 디트릭스 지원 극장과 조회 방법                                                                                                                     |
| [AI 조회 가이드](docs/ai-instruction.md)                        | 도구 선택과 상품·매장·재고 조회 순서                                                                                                               |
| [개발·직접 배포](CONTRIBUTING.md)                               | 개발 환경과 자체 서버 운영                                                                                                                         |
| [운영 가이드](scripts/ops/README.md)                            | 헬스 체크·요청량·[중계 한도](docs/health-check-stock-and-quota.md)·[주소 검색](docs/geocoding-resilience.md)·[웹 검색 노출](docs/web-discovery.md) |

<p align="center">
  <img src="./assets/readme-banners/docs.webp" alt="책과 폴더, 마을 지도를 함께 살펴보는 햄스터" width="100%">
</p>

## Special Thanks

- [@thecats1105](https://github.com/thecats1105): 다이소 진열 위치 조회
- [@betterthanhajin](https://github.com/betterthanhajin): CGV 서비스
- [@LLagoon3](https://github.com/LLagoon3): 다이소 재고 인증
- [@vkehfdl1](https://github.com/vkehfdl1): 롯데시네마 잔여 좌석 계산 수정
- [@bgmbgm94](https://github.com/bgmbgm94): 디트릭스 표준 포트 전환
- [@Jacob-9909](https://github.com/Jacob-9909): 개발자 요청 API의 null 본문 오류 수정, 메가박스 경기 광주시 지역 코드 판정 수정
- [제로초님](https://youtube.com/shorts/ZgIqA1NCEp0?si=UW0pKsSpqmEi7lXG): 프로젝트 홍보

<p align="center">
  <img src="./assets/readme-banners/thanks.webp" alt="지원 서비스 마을을 함께 만드는 기여자 햄스터들" width="100%">
</p>

MIT License
