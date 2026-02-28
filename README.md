<div align="center">

<img src="./assets/logo.svg" alt="Daiso MCP" width="120" height="120">

<br>
<br>

# Daiso MCP Server

다이소(Daiso) 제품 정보를 제공하는 MCP 서버

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-8B5CF6.svg)](https://modelcontextprotocol.io/)

</div>

<br>

---

<br>

## AI 앱에서 MCP 연결하기

MCP 서버 URL:

```
https://mcp.aka.page/mcp
```

<br>

### ChatGPT

> Pro 이상 플랜 필요

1. 프로필 아이콘 → **Settings** 클릭
2. **Connectors** → **Advanced Settings** 이동
3. **Developer Mode (beta)** 활성화
4. **Create** 버튼 클릭
5. 다음 정보 입력:
   - **Name:** `Daiso MCP`
   - **MCP Server URL:** `https://mcp.aka.page/mcp`
6. "I trust this application" 체크 후 생성
7. 새 채팅에서 Developer Mode 선택 후 사용

참고: [OpenAI MCP 가이드](https://platform.openai.com/docs/guides/tools-connectors-mcp)

<br>

### Claude

> Pro / Max / Team / Enterprise 플랜 필요

1. **Settings** → **Connectors** 이동
2. **Add custom connector** 클릭
3. 원격 MCP 서버 URL 입력: `https://mcp.aka.page/mcp`
4. **Add** 클릭하여 완료
5. 대화창에서 **+** 버튼 → **Connectors** → 토글로 활성화

참고: [Claude Remote MCP 가이드](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

<br>

### Gemini CLI

`settings.json`에 다음 설정 추가:

```json
{
  "mcpServers": {
    "daiso": {
      "httpUrl": "https://mcp.aka.page/mcp"
    }
  }
}
```

또는 CLI 명령어 사용:

```bash
gemini mcp add daiso --url https://mcp.aka.page/mcp
```

참고: [Gemini CLI MCP 가이드](https://geminicli.com/docs/tools/mcp-server/)

<br>

---

<br>

## 기능

### search_products

다이소 제품을 검색합니다.

| 파라미터 | 필수 | 설명 |
|:---------|:----:|:-----|
| `query` | O | 검색할 제품명 또는 키워드 |
| `page` | | 페이지 번호 (기본값: 1) |
| `pageSize` | | 페이지당 결과 수 (기본값: 30) |

<br>

### find_stores

다이소 매장을 검색합니다.

| 파라미터 | 필수 | 설명 |
|:---------|:----:|:-----|
| `keyword` | | 매장명 또는 주소 키워드 |
| `sido` | | 시/도 (예: 서울, 경기) |
| `gugun` | | 구/군 (예: 강남구) |
| `dong` | | 동 (예: 역삼동) |
| `limit` | | 최대 매장 수 (기본값: 50) |

<br>

### check_inventory

특정 제품의 매장별 재고를 확인합니다.

| 파라미터 | 필수 | 설명 |
|:---------|:----:|:-----|
| `productId` | O | 제품 ID |
| `storeQuery` | | 매장 검색어 (예: 안산 중앙역) |
| `latitude` | | 위도 (기본값: 서울 시청) |
| `longitude` | | 경도 (기본값: 서울 시청) |
| `page` | | 페이지 번호 (기본값: 1) |
| `pageSize` | | 페이지당 결과 수 (기본값: 30) |

<br>

### get_price_info

제품의 가격 정보를 조회합니다.

| 파라미터 | 필수 | 설명 |
|:---------|:----:|:-----|
| `productId` | | 제품 ID |
| `productName` | | 제품명 (productId가 없을 경우 사용) |

<br>

---

<br>

## 사용 예시

```
사용자: 수납박스 검색해줘
AI: search_products 도구로 제품 목록 조회

사용자: 이 제품 안산 중앙역 근처 매장에 재고 있어?
AI: check_inventory 도구로 특정 매장 재고 확인

사용자: 강남역 근처 다이소 매장 찾아줘
AI: find_stores 도구로 매장 검색
```

<br>

---

<br>

## 개발

```bash
# 설치
npm install

# 로컬 개발 서버
npm run dev

# 배포
npm run deploy
```

<br>

---

<br>

## 아키텍처

| 항목 | 기술 |
|:-----|:-----|
| 런타임 | Cloudflare Workers |
| 프레임워크 | Hono + TypeScript |
| 프로토콜 | MCP (Model Context Protocol) |
| 전송 | SSE (Server-Sent Events) |

<br>

---

<br>

## 프로젝트 구조

```
daiso-mcp/
├── src/
│   ├── index.ts              # MCP 서버 메인
│   ├── tools/                # 도구 구현
│   │   ├── searchProducts.ts
│   │   ├── findStores.ts
│   │   ├── checkInventory.ts
│   │   └── getPriceInfo.ts
│   ├── types/                # 타입 정의
│   └── utils/                # 유틸리티
├── wrangler.toml             # Cloudflare Workers 설정
└── package.json
```

<br>

---

<div align="center">

<br>

MIT License

<br>

</div>
