# Daiso MCP Server

다이소(Daiso) 제품 정보를 제공하는 MCP(Model Context Protocol) 서버입니다. Cloudflare Workers 기반의 서버리스 아키텍처로 구축되어 모바일에서도 HTTP API를 통해 사용할 수 있습니다.

## 기능

### 1. 제품 검색 (search_products)
다이소 제품을 검색합니다.
- **입력 파라미터:**
  - `query` (필수): 검색할 제품명 또는 키워드
  - `category` (선택): 제품 카테고리
  - `maxPrice` (선택): 최대 가격

### 2. 매장 찾기 (find_stores)
위치 기반으로 가까운 다이소 매장을 찾습니다.
- **입력 파라미터:**
  - `latitude` (필수): 위도
  - `longitude` (필수): 경도
  - `radius` (선택): 검색 반경(km), 기본값 5km
  - `limit` (선택): 최대 매장 수, 기본값 10개

### 3. 재고 확인 (check_inventory)
특정 매장의 제품 재고를 확인합니다.
- **입력 파라미터:**
  - `storeId` (필수): 매장 ID
  - `productId` (필수): 제품 ID

### 4. 가격 정보 (get_price_info)
제품의 가격 정보를 조회합니다.
- **입력 파라미터:**
  - `productId` (필수): 제품 ID

## 설치

```bash
npm install
```

## 개발

로컬에서 개발 서버 실행:

```bash
npm run dev
```

서버가 시작되면 `http://localhost:8787`에서 접근할 수 있습니다.

## API 엔드포인트

### GET /
서버 정보 및 사용 가능한 엔드포인트 목록

### GET /tools
사용 가능한 모든 도구 목록 조회

**응답 예시:**
```json
{
  "tools": [
    {
      "name": "search_products",
      "description": "다이소 제품을 검색합니다...",
      "inputSchema": { ... }
    }
  ]
}
```

### POST /execute
도구 실행

**요청 예시:**
```json
{
  "name": "search_products",
  "arguments": {
    "query": "수납박스",
    "maxPrice": 5000
  }
}
```

**응답 예시:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{ ... }"
    }
  ]
}
```

## 사용 예시

### cURL로 제품 검색
```bash
curl -X POST http://localhost:8787/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_products",
    "arguments": {
      "query": "수납박스"
    }
  }'
```

### JavaScript로 매장 찾기
```javascript
const response = await fetch('https://your-worker.workers.dev/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'find_stores',
    arguments: {
      latitude: 37.5665,
      longitude: 126.9780,
      radius: 5
    }
  })
});

const result = await response.json();
console.log(result);
```

## 배포

Cloudflare Workers에 배포:

```bash
npm run deploy
```

배포 전에 Cloudflare 계정이 필요하며, `wrangler` CLI가 로그인되어 있어야 합니다:

```bash
npx wrangler login
```

배포 후 `https://your-worker.workers.dev` 형식의 URL을 통해 접근할 수 있습니다.

## 아키텍처

- **프레임워크:** TypeScript
- **배포:** Cloudflare Workers (서버리스)
- **전송:** HTTP REST API
- **CORS:** 모든 도메인 허용 (프로덕션에서는 제한 권장)

## 프로젝트 구조

```
daiso-mcp/
├── src/
│   ├── index.ts              # HTTP 서버 메인 파일
│   └── tools/                # 도구 구현
│       ├── searchProducts.ts # 제품 검색
│       ├── findStores.ts     # 매장 찾기
│       ├── checkInventory.ts # 재고 확인
│       └── getPriceInfo.ts   # 가격 정보
├── package.json
├── tsconfig.json
├── wrangler.toml            # Cloudflare Workers 설정
└── README.md
```

## 모바일 앱 연동

이 서버는 HTTP API를 제공하므로 모바일 앱(iOS, Android)에서 쉽게 연동할 수 있습니다.

### iOS (Swift) 예시
```swift
let url = URL(string: "https://your-worker.workers.dev/execute")!
var request = URLRequest(url: url)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")

let body: [String: Any] = [
    "name": "search_products",
    "arguments": ["query": "수납박스"]
]
request.httpBody = try? JSONSerialization.data(withJSONObject: body)

URLSession.shared.dataTask(with: request) { data, response, error in
    // 응답 처리
}.resume()
```

### Android (Kotlin) 예시
```kotlin
val client = OkHttpClient()
val json = JSONObject()
    .put("name", "search_products")
    .put("arguments", JSONObject().put("query", "수납박스"))

val request = Request.Builder()
    .url("https://your-worker.workers.dev/execute")
    .post(json.toString().toRequestBody("application/json".toMediaType()))
    .build()

client.newCall(request).enqueue(object : Callback {
    override fun onResponse(call: Call, response: Response) {
        // 응답 처리
    }
})
```

## 주의사항

현재 구현은 목업(mock) 데이터를 사용합니다. 실제 운영 환경에서는 다음 작업이 필요합니다:

1. **데이터 소스 연동:**
   - 다이소 공식 API 연동 (제공 시)
   - 또는 웹 스크래핑 구현
   - 또는 Cloudflare D1/KV를 사용한 데이터베이스 구축

2. **데이터 업데이트:**
   - 제품 정보 정기 업데이트
   - 재고 실시간 동기화
   - 가격 정보 업데이트

3. **보안 및 성능:**
   - API 키/인증 구현 (Authorization 헤더)
   - 레이트 리미팅 (Cloudflare Workers의 Rate Limiting API 사용)
   - 캐싱 전략 (Cloudflare Cache API 또는 KV 사용)
   - CORS 정책 강화 (특정 도메인만 허용)
   - 에러 핸들링 강화

4. **프로덕션 권장사항:**
   - 환경 변수를 통한 설정 관리
   - 로깅 및 모니터링 (Cloudflare Workers Analytics)
   - 입력 값 검증 강화
   - 에러 추적 (Sentry 등)

## 라이선스

MIT
