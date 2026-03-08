<div align="center">

<img src="./assets/logo.svg" alt="Daiso MCP" width="120" height="120">

<br>
<br>

# Daiso MCP Server

다이소(제품/매장/재고), CU(매장/재고), 올리브영(매장/재고), 메가박스(지점/영화/시간표/좌석), CGV(극장/영화/시간표) 조회 기능을 AI에 연결합니다.

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-8B5CF6.svg)](https://modelcontextprotocol.io/)
[![Coverage](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml/badge.svg?branch=main)](https://github.com/hmmhmmhm/daiso-mcp/actions/workflows/coverage.yml)

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
메가박스 mcp로 강남점 영화와 잔여 좌석 알려줘
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
메가박스 mcp를 사용해서 강남역 근처 지점 찾아줘
메가박스 mcp를 사용해서 강남점 영화 목록이랑 잔여 좌석 확인해줘
CGV mcp를 사용해서 서울 지역 극장 목록 찾아줘
CGV mcp를 사용해서 강남 CGV 영화랑 시간표 확인해줘
```

참고: [Claude Remote MCP 가이드](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

<br>

### ![Claude Code](https://img.shields.io/badge/Claude_Code-D4A27F?logo=anthropic&logoColor=white)

> Claude Code CLI에서 MCP 서버 추가

```bash
claude mcp add daiso-mcp https://mcp.aka.page --transport sse
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

사용자: 강남역 근처 메가박스 지점 찾아줘
AI: (https://mcp.aka.page/api/megabox/theaters?lat=37.4982&lng=127.0264 호출 후 결과 제공)

사용자: 강남 CGV 시간표 알려줘
AI: (https://mcp.aka.page/api/cgv/timetable?playDate=20260304&theaterCode=0056 호출 후 결과 제공)
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
npx daiso cu-stores 강남
npx daiso cu-inventory 과자 --storeKeyword 강남
npx daiso get /api/cgv/movies --playDate 20260307 --theaterCode 0056

# 원본 JSON 필요 시
npx daiso products 수납박스 --json
```

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

---

<br>

## 기능

### daiso_search_products

다이소 제품을 검색합니다.

| 파라미터   | 필수 | 설명                          |
| :--------- | :--: | :---------------------------- |
| `query`    |  O   | 검색할 제품명 또는 키워드     |
| `page`     |      | 페이지 번호 (기본값: 1)       |
| `pageSize` |      | 페이지당 결과 수 (기본값: 30) |

<br>

### daiso_find_stores

다이소 매장을 검색합니다.

| 파라미터  | 필수 | 설명                      |
| :-------- | :--: | :------------------------ |
| `keyword` |      | 매장명 또는 주소 키워드   |
| `sido`    |      | 시/도 (예: 서울, 경기)    |
| `gugun`   |      | 구/군 (예: 강남구)        |
| `dong`    |      | 동 (예: 역삼동)           |
| `limit`   |      | 최대 매장 수 (기본값: 50) |

<br>

### daiso_check_inventory

특정 제품의 매장별 재고를 확인합니다.

| 파라미터     | 필수 | 설명                          |
| :----------- | :--: | :---------------------------- |
| `productId`  |  O   | 제품 ID                       |
| `storeQuery` |      | 매장 검색어 (예: 안산 중앙역) |
| `latitude`   |      | 위도 (기본값: 서울 시청)      |
| `longitude`  |      | 경도 (기본값: 서울 시청)      |
| `page`       |      | 페이지 번호 (기본값: 1)       |
| `pageSize`   |      | 페이지당 결과 수 (기본값: 30) |

<br>

### daiso_get_price_info

제품의 가격 정보를 조회합니다.

| 파라미터      | 필수 | 설명                                |
| :------------ | :--: | :---------------------------------- |
| `productId`   |      | 제품 ID                             |
| `productName` |      | 제품명 (productId가 없을 경우 사용) |

<br>

### daiso_get_display_location

다이소 매장 내 상품의 진열 위치(구역/층)를 조회합니다.

| 파라미터    | 필수 | 설명                                     |
| :---------- | :--: | :--------------------------------------- |
| `productId` |  O   | 상품 ID (daiso_search_products로 조회)   |
| `storeCode` |  O   | 매장 코드 (daiso_check_inventory로 조회) |

<br>

### cu_find_nearby_stores

위치 기반으로 주변 CU 매장을 조회합니다.

| 파라미터    | 필수 | 설명                                |
| :---------- | :--: | :---------------------------------- |
| `latitude`  |      | 위도 (기본값: 서울 시청)            |
| `longitude` |      | 경도 (기본값: 서울 시청)            |
| `keyword`   |      | 매장명/지역 키워드 (예: 강남, 안산) |
| `limit`     |      | 최대 결과 수 (기본값: 20)           |

<br>

### cu_check_inventory

상품 키워드로 CU 재고를 조회하고 주변 매장 정보를 함께 반환합니다.

| 파라미터       | 필수 | 설명                         |
| :------------- | :--: | :--------------------------- |
| `keyword`      |  O   | 재고를 확인할 상품 키워드    |
| `latitude`     |      | 위도 (기본값: 서울 시청)     |
| `longitude`    |      | 경도 (기본값: 서울 시청)     |
| `storeKeyword` |      | 주변 매장 필터 키워드        |
| `size`         |      | 검색 결과 수 (기본값: 20)    |
| `offset`       |      | 검색 시작 오프셋 (기본값: 0) |
| `searchSort`   |      | 정렬 방식 (기본값: `recom`)  |
| `storeLimit`   |      | 매장 결과 수 (기본값: 10)    |

<br>

### oliveyoung_find_nearby_stores

Zyte API 기반으로 내 주변 올리브영 매장을 조회합니다.

| 파라미터    | 필수 | 설명                                |
| :---------- | :--: | :---------------------------------- |
| `latitude`  |      | 위도 (기본값: 서울 시청)            |
| `longitude` |      | 경도 (기본값: 서울 시청)            |
| `keyword`   |      | 매장명/지역 키워드 (예: 명동, 강남) |
| `pageIdx`   |      | 페이지 번호 (기본값: 1)             |
| `limit`     |      | 최대 결과 수 (기본값: 20)           |

<br>

### oliveyoung_check_inventory

Zyte API 기반으로 올리브영 상품 재고를 조회하고 주변 매장 정보를 함께 반환합니다.

| 파라미터         | 필수 | 설명                           |
| :--------------- | :--: | :----------------------------- |
| `keyword`        |  O   | 재고를 확인할 상품 키워드      |
| `latitude`       |      | 위도 (기본값: 서울 시청)       |
| `longitude`      |      | 경도 (기본값: 서울 시청)       |
| `storeKeyword`   |      | 주변 매장 검색 키워드          |
| `page`           |      | 페이지 번호 (기본값: 1)        |
| `size`           |      | 페이지당 상품 수 (기본값: 20)  |
| `includeSoldOut` |      | 품절 포함 여부 (기본값: false) |

<br>

### megabox_find_nearby_theaters

사용자 좌표 기준으로 메가박스 주변 지점을 거리순으로 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `latitude`  |      | 위도 (기본값: 서울 시청)           |
| `longitude` |      | 경도 (기본값: 서울 시청)           |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`     |      | 최대 결과 수 (기본값: 10)          |

<br>

### megabox_list_now_showing

날짜/지점 조건으로 메가박스 영화 및 상영 회차 목록을 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID (예: 1372)                 |
| `movieId`   |      | 영화 ID (예: 25104500)             |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |

<br>

### megabox_get_remaining_seats

영화/지점/날짜 조건으로 회차별 남은 좌석 수를 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID                            |
| `movieId`   |      | 영화 ID                            |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`     |      | 최대 결과 수 (기본값: 50)          |

<br>

### cgv_find_theaters

지역 코드 기준으로 CGV 극장 목록을 조회합니다.

| 파라미터     | 필수 | 설명                               |
| :----------- | :--: | :--------------------------------- |
| `playDate`   |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `regionCode` |      | 지역 코드 (예: 01 서울)            |
| `limit`      |      | 최대 결과 수 (기본값: 30)          |
| `timeoutMs`  |      | 요청 제한 시간(ms, 기본값: 15000)  |

<br>

### cgv_search_movies

날짜/극장 조건으로 CGV 영화 목록을 조회합니다.

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

<br>

### cgv_get_timetable

날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다.

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `movieCode`   |      | CGV 영화 코드                      |
| `limit`       |      | 최대 결과 수 (기본값: 50)          |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

<br>

### 올리브영 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 올리브영 REST 응답을 캐싱합니다.

- `GET /api/oliveyoung/stores`: 24시간 TTL
- `GET /api/oliveyoung/inventory`: 10분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### 메가박스 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 메가박스 REST 응답을 캐싱합니다.

- `GET /api/megabox/theaters`: 24시간 TTL
- `GET /api/megabox/movies`: 10분 TTL
- `GET /api/megabox/seats`: 3분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### CGV REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 CGV REST 응답을 캐싱합니다.

- `GET /api/cgv/theaters`: 24시간 TTL
- `GET /api/cgv/movies`: 10분 TTL
- `GET /api/cgv/timetable`: 3분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### 다이소 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 다이소 REST 응답을 캐싱합니다.

- `GET /api/daiso/products`: 30분 TTL
- `GET /api/daiso/products/:id`: 1시간 TTL
- `GET /api/daiso/stores`: 24시간 TTL
- `GET /api/daiso/inventory`: 10분 TTL
- `GET /api/daiso/display-location`: 10분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### CU REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 CU REST 응답을 캐싱합니다.

- `GET /api/cu/stores`: 24시간 TTL
- `GET /api/cu/inventory`: 10분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

---

<br>

## REST API

MCP를 지원하지 않는 서비스를 위한 GET 기반 REST API입니다.

### 엔드포인트

| 엔드포인트                        | 설명                                |
| :-------------------------------- | :---------------------------------- |
| `GET /prompt`                     | API 사용법 설명 페이지 (에이전트용) |
| `GET /api/daiso/products`         | 제품 검색                           |
| `GET /api/daiso/products/:id`     | 제품 상세 정보                      |
| `GET /api/daiso/stores`           | 매장 검색                           |
| `GET /api/daiso/inventory`        | 재고 확인                           |
| `GET /api/daiso/display-location` | 진열 위치 조회                      |
| `GET /api/cu/stores`              | CU 매장 검색                        |
| `GET /api/cu/inventory`           | CU 재고 확인                        |
| `GET /api/oliveyoung/stores`      | 올리브영 매장 검색                  |
| `GET /api/oliveyoung/inventory`   | 올리브영 재고 확인                  |
| `GET /api/megabox/theaters`       | 메가박스 주변 지점 조회             |
| `GET /api/megabox/movies`         | 메가박스 영화/회차 목록 조회        |
| `GET /api/megabox/seats`          | 메가박스 잔여 좌석 조회             |
| `GET /api/cgv/theaters`           | CGV 극장 목록 조회                  |
| `GET /api/cgv/movies`             | CGV 영화 목록 조회                  |
| `GET /api/cgv/timetable`          | CGV 상영 시간표 조회                |

### 제품 검색

```
GET /api/daiso/products?q={검색어}&page={페이지}&pageSize={개수}
```

| 파라미터   | 필수 | 설명                          |
| :--------- | :--: | :---------------------------- |
| `q`        |  O   | 검색 키워드                   |
| `page`     |      | 페이지 번호 (기본값: 1)       |
| `pageSize` |      | 페이지당 결과 수 (기본값: 30) |

### 매장 검색

```
GET /api/daiso/stores?keyword={키워드}&sido={시도}&limit={개수}
```

| 파라미터  | 필수 | 설명                                                |
| :-------- | :--: | :-------------------------------------------------- |
| `keyword` |  △   | 매장명/주소 키워드 (keyword 또는 sido 중 하나 필수) |
| `sido`    |  △   | 시/도                                               |
| `gugun`   |      | 구/군                                               |
| `dong`    |      | 동                                                  |
| `limit`   |      | 최대 결과 수 (기본값: 50)                           |

### 재고 확인

```
GET /api/daiso/inventory?productId={제품ID}&lat={위도}&lng={경도}
```

| 파라미터    | 필수 | 설명                          |
| :---------- | :--: | :---------------------------- |
| `productId` |  O   | 제품 ID                       |
| `lat`       |      | 위도 (기본값: 37.5665)        |
| `lng`       |      | 경도 (기본값: 126.978)        |
| `keyword`   |      | 매장 검색어                   |
| `page`      |      | 페이지 번호 (기본값: 1)       |
| `pageSize`  |      | 페이지당 결과 수 (기본값: 30) |

### 올리브영 매장 검색

```
GET /api/oliveyoung/stores?keyword={키워드}&lat={위도}&lng={경도}
```

| 파라미터  | 필수 | 설명                                |
| :-------- | :--: | :---------------------------------- |
| `keyword` |      | 매장명/지역 키워드 (예: 명동, 강남) |
| `lat`     |      | 위도 (기본값: 37.5665)              |
| `lng`     |      | 경도 (기본값: 126.978)              |
| `pageIdx` |      | 페이지 번호 (기본값: 1)             |
| `limit`   |      | 최대 결과 수 (기본값: 20)           |

### CU 매장 검색

```
GET /api/cu/stores?keyword={키워드}&lat={위도}&lng={경도}
```

| 파라미터  | 필수 | 설명                                |
| :-------- | :--: | :---------------------------------- |
| `keyword` |      | 매장명/지역 키워드 (예: 강남, 안산) |
| `lat`     |      | 위도 (기본값: 37.5665)              |
| `lng`     |      | 경도 (기본값: 126.978)              |
| `limit`   |      | 최대 결과 수 (기본값: 20)           |

### CU 재고 확인

```
GET /api/cu/inventory?keyword={검색어}&lat={위도}&lng={경도}
```

| 파라미터       | 필수 | 설명                           |
| :------------- | :--: | :----------------------------- |
| `keyword`      |  O   | 검색 키워드 (예: 과자, 컵라면) |
| `lat`          |      | 위도 (기본값: 37.5665)         |
| `lng`          |      | 경도 (기본값: 126.978)         |
| `storeKeyword` |      | 주변 매장 필터 키워드          |
| `size`         |      | 검색 결과 수 (기본값: 20)      |
| `offset`       |      | 검색 시작 오프셋 (기본값: 0)   |
| `searchSort`   |      | 정렬 방식 (기본값: `recom`)    |
| `storeLimit`   |      | 매장 결과 수 (기본값: 10)      |

### 올리브영 재고 확인

```
GET /api/oliveyoung/inventory?keyword={검색어}&lat={위도}&lng={경도}
```

| 파라미터         | 필수 | 설명                           |
| :--------------- | :--: | :----------------------------- |
| `keyword`        |  O   | 검색 키워드 (예: 선크림, 립밤) |
| `lat`            |      | 위도 (기본값: 37.5665)         |
| `lng`            |      | 경도 (기본값: 126.978)         |
| `storeKeyword`   |      | 주변 매장 필터 키워드          |
| `page`           |      | 페이지 번호 (기본값: 1)        |
| `size`           |      | 페이지당 결과 수 (기본값: 20)  |
| `sort`           |      | 정렬 코드 (기본값: 01)         |
| `includeSoldOut` |      | 품절 포함 여부 (기본값: false) |

### 메가박스 주변 지점 조회

```
GET /api/megabox/theaters?lat={위도}&lng={경도}&playDate={YYYYMMDD}&areaCode={지역코드}
```

| 파라미터   | 필수 | 설명                               |
| :--------- | :--: | :--------------------------------- |
| `lat`      |      | 위도 (기본값: 37.5665)             |
| `lng`      |      | 경도 (기본값: 126.978)             |
| `playDate` |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `areaCode` |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`    |      | 최대 결과 수 (기본값: 10)          |

### 메가박스 영화/회차 목록 조회

```
GET /api/megabox/movies?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}
```

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID (예: 1372)                 |
| `movieId`   |      | 영화 ID (예: 25104500)             |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |

### 메가박스 잔여 좌석 조회

```
GET /api/megabox/seats?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}
```

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID                            |
| `movieId`   |      | 영화 ID                            |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`     |      | 최대 결과 수 (기본값: 50)          |

### CGV 극장 목록 조회

```
GET /api/cgv/theaters?playDate={YYYYMMDD}&regionCode={지역코드}
```

| 파라미터     | 필수 | 설명                               |
| :----------- | :--: | :--------------------------------- |
| `playDate`   |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `regionCode` |      | 지역 코드 (예: 01 서울)            |
| `limit`      |      | 최대 결과 수 (기본값: 30)          |
| `timeoutMs`  |      | 요청 제한 시간(ms, 기본값: 15000)  |

### CGV 영화 목록 조회

```
GET /api/cgv/movies?playDate={YYYYMMDD}&theaterCode={극장코드}
```

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

### CGV 시간표 조회

```
GET /api/cgv/timetable?playDate={YYYYMMDD}&theaterCode={극장코드}&movieCode={영화코드}
```

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `movieCode`   |      | CGV 영화 코드                      |
| `limit`       |      | 최대 결과 수 (기본값: 50)          |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

### 응답 형식

```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "page": 1, "pageSize": 30 }
}
```

<br>

---

<br>

## 사용 예시

```
사용자: 수납박스 검색해줘
AI: daiso_search_products 도구로 제품 목록 조회

사용자: 이 제품 안산 중앙역 근처 매장에 재고 있어?
AI: daiso_check_inventory 도구로 특정 매장 재고 확인

사용자: 강남역 근처 다이소 매장 찾아줘
AI: daiso_find_stores 도구로 매장 검색

사용자: 이 상품 이 매장 어디에 있어?
AI: daiso_get_display_location 도구로 매장 내 진열 위치 조회

사용자: 명동 근처 올리브영 매장 찾아줘
AI: oliveyoung_find_nearby_stores 도구로 주변 매장 검색

사용자: 올리브영 선크림 재고 확인해줘
AI: oliveyoung_check_inventory 도구로 재고/매장 정보 조회

사용자: 강남 근처 CU 매장 찾아줘
AI: cu_find_nearby_stores 도구로 CU 매장 검색

사용자: CU 과자 재고 확인해줘
AI: cu_check_inventory 도구로 CU 재고/매장 정보 조회

사용자: 강남역 근처 메가박스 지점 찾아줘
AI: megabox_find_nearby_theaters 도구로 주변 지점 조회

사용자: 메가박스 강남점 영화 목록과 잔여 좌석 알려줘
AI: megabox_list_now_showing / megabox_get_remaining_seats 도구로 회차/좌석 조회

사용자: 서울 지역 CGV 극장 목록 알려줘
AI: cgv_find_theaters 도구로 CGV 극장 목록 조회

사용자: CGV 강남 상영 영화랑 시간표 알려줘
AI: cgv_search_movies / cgv_get_timetable 도구로 영화/시간표 조회
```

<br>

---

<br>

## 개발

```bash
# Node 버전 맞추기
nvm use

# 설치
npm ci

# 환경 변수 설정
cp .env.example .env
# .env 파일에 ZYTE_API_KEY 값 입력

# 품질 검사 (포맷/린트/타입/테스트)
npm run check

# 로컬 개발 서버
npm run dev

# 배포
npm run deploy
```

## npm 퍼블리싱

```bash
# npm 로그인
npm login

# 배포 산출물/메타 검증
npm run release:dry-run

# 퍼블리시 (공개 패키지)
npm run publish:public
```

기여 가이드는 [CONTRIBUTING.md](./CONTRIBUTING.md)에서 확인할 수 있습니다.

<br>

---

<br>

## 아키텍처

| 항목       | 기술                         |
| :--------- | :--------------------------- |
| 런타임     | Cloudflare Workers           |
| 프레임워크 | Hono + TypeScript            |
| 프로토콜   | MCP (Model Context Protocol) |
| 전송       | SSE (Server-Sent Events)     |

<br>

---

<br>

## 프로젝트 구조

```
daiso-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── core/                 # 핵심 모듈
│   │   ├── types.ts          # 공통 타입
│   │   ├── interfaces.ts     # ServiceProvider 인터페이스
│   │   └── registry.ts       # ServiceRegistry
│   ├── services/             # 서비스 프로바이더
│   │   ├── daiso/            # 다이소 서비스
│   │   ├── cu/               # CU 서비스
│   │   ├── oliveyoung/       # 올리브영 서비스 (Zyte API)
│   │   ├── megabox/          # 메가박스 서비스
│   │   └── cgv/              # CGV 서비스
│   ├── api/                  # REST API (MCP 미지원 서비스용)
│   │   ├── handlers.ts       # 다이소/CU/올리브영 API 핸들러
│   │   ├── megaboxHandlers.ts # 메가박스 API 핸들러
│   │   ├── cgvHandlers.ts    # CGV API 핸들러
│   │   └── routes/           # 서비스별 API 라우트
│   ├── pages/                # 정적 페이지
│   │   └── prompt.ts         # 에이전트용 프롬프트 페이지
│   └── utils/                # 유틸리티
├── wrangler.toml             # Cloudflare Workers 설정
└── package.json
```

<br>

---

<br>

## 확장 가능한 아키텍처

이 프로젝트는 **플러그인 기반 아키텍처**로 설계되어 새로운 서비스를 쉽게 추가할 수 있습니다.

### 핵심 컴포넌트

| 컴포넌트           | 역할                                   |
| :----------------- | :------------------------------------- |
| `ServiceProvider`  | 모든 서비스가 구현해야 하는 인터페이스 |
| `ServiceRegistry`  | 서비스 등록 및 MCP 서버 연결 관리      |
| `ToolRegistration` | 도구 메타데이터와 핸들러 정의          |

### 새 서비스 추가 방법

예: CU 편의점 서비스 추가

```typescript
// 1. src/services/cu/index.ts 생성
import type { ServiceProvider } from '../../core/interfaces.js';

class CuService implements ServiceProvider {
  readonly metadata = {
    id: 'cu',
    name: 'CU 편의점',
    version: '1.0.0',
  };

  getTools() {
    return [
      /* cu_search_products, cu_find_stores 등 */
    ];
  }
}

export function createCuService(): ServiceProvider {
  return new CuService();
}
```

```typescript
// 2. src/index.ts에 한 줄 추가
import { createCuService } from './services/cu/index.js';

registry.registerAll([createDaisoService, createCuService]);
```

<br>

---

<div align="center">

<br>

MIT License

<br>

</div>
