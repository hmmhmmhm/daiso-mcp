# Daiso MCP Server

다이소(Daiso) 제품 정보를 제공하는 MCP(Model Context Protocol) 서버입니다. Cloudflare Workers 기반의 서버리스 아키텍처로 구축되어 있습니다.

## 서버 URL

**https://mcp.aka.page**

| 엔드포인트 | 설명 |
|-----------|------|
| `https://mcp.aka.page/mcp` | MCP 프로토콜 엔드포인트 |
| `https://mcp.aka.page/health` | 헬스 체크 |
| `https://mcp.aka.page/` | 서버 정보 |

## AI 앱에서 MCP 연결하기

### ChatGPT (Pro 이상)

1. 프로필 아이콘 → **Settings** 클릭
2. **Connectors** → **Advanced Settings** 이동
3. **Developer Mode (beta)** 활성화
4. **Create** 버튼 클릭
5. 다음 정보 입력:
   - **Name:** Daiso MCP
   - **MCP Server URL:** `https://mcp.aka.page/mcp`
6. "I trust this application" 체크 후 생성
7. 새 채팅에서 Developer Mode 선택 후 사용

> 참고: [OpenAI MCP 가이드](https://platform.openai.com/docs/guides/tools-connectors-mcp)

### Claude (Pro/Max/Team/Enterprise)

1. **Settings** → **Connectors** 이동
2. **Add custom connector** 클릭
3. 원격 MCP 서버 URL 입력:
   ```
   https://mcp.aka.page/mcp
   ```
4. **Add** 클릭하여 완료
5. 대화창에서 **+** 버튼 → **Connectors** → 토글로 활성화

> 참고: [Claude Remote MCP 가이드](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

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

연결 확인:
```bash
gemini mcp list
```

> 참고: [Gemini CLI MCP 가이드](https://geminicli.com/docs/tools/mcp-server/)

## 기능

### 1. 제품 검색 (search_products)

다이소 제품을 검색합니다.

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `query` | O | 검색할 제품명 또는 키워드 |
| `page` | X | 페이지 번호 (기본값: 1) |
| `pageSize` | X | 페이지당 결과 수 (기본값: 30) |

### 2. 매장 찾기 (find_stores)

다이소 매장을 검색합니다.

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `keyword` | X | 매장명 또는 주소 키워드 |
| `sido` | X | 시/도 (예: 서울, 경기) |
| `gugun` | X | 구/군 (예: 강남구) |
| `dong` | X | 동 (예: 역삼동) |
| `limit` | X | 최대 매장 수 (기본값: 50) |

### 3. 재고 확인 (check_inventory)

특정 제품의 매장별 재고를 확인합니다.

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `productId` | O | 제품 ID |
| `storeQuery` | X | 매장 검색어 (예: 안산 중앙역) |
| `latitude` | X | 위도 (기본값: 서울 시청) |
| `longitude` | X | 경도 (기본값: 서울 시청) |
| `page` | X | 페이지 번호 (기본값: 1) |
| `pageSize` | X | 페이지당 결과 수 (기본값: 30) |

### 4. 가격 정보 (get_price_info)

제품의 가격 정보를 조회합니다.

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `productId` | X | 제품 ID |
| `productName` | X | 제품명 (productId가 없을 경우 사용) |

## 사용 예시

### 제품 검색 후 재고 확인

```
"수납박스 검색해줘"
→ search_products 도구로 제품 목록 조회

"이 제품 안산 중앙역 근처 매장에 재고 있어?"
→ check_inventory 도구로 특정 매장 재고 확인
```

### 매장 찾기

```
"강남역 근처 다이소 매장 찾아줘"
→ find_stores 도구로 매장 검색
```

## 개발

### 설치

```bash
npm install
```

### 로컬 개발 서버

```bash
npm run dev
```

### 배포

```bash
npm run deploy
```

## 아키텍처

- **런타임:** Cloudflare Workers
- **프레임워크:** Hono + TypeScript
- **프로토콜:** MCP (Model Context Protocol)
- **전송:** SSE (Server-Sent Events)

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

## 라이선스

MIT
