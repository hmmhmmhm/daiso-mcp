# Playwright를 이용한 다이소 네트워크 분석 계획

## 목표

Playwright를 사용하여 실제 브라우저에서 다이소 페이지를 열고, 네트워크 요청을 캡처하여 리플레이 세션 가능 여부를 판단합니다.

---

## Playwright MCP 설정 완료

### 파일 생성
- `.mcp.json` - Playwright MCP 서버 설정
- `.claude/settings.local.json` - `enableAllProjectMcpServers: true` 추가

### 활성화 방법
Claude Code 세션을 종료하고 다시 시작하면 Playwright 도구를 사용할 수 있습니다.

---

## 분석 계획

### 1단계: 페이지 방문 및 세션 획득

```
Playwright로 다이소 매장 검색 페이지 열기:
→ https://www.daiso.co.kr/cs/shop

목적:
- 페이지 로드 시 설정되는 쿠키 확인
- 초기 JavaScript 실행 확인
- 세션 생성 여부 확인
```

### 2단계: 네트워크 요청 캡처 활성화

```
네트워크 모니터링 시작:
- 모든 XHR/Fetch 요청 기록
- Request Headers (쿠키, Referer 등)
- Request Body (POST 파라미터)
- Response (JSON/HTML 여부)
```

### 3단계: 매장 검색 실행

**시나리오 A: 이름으로 검색**
```
1. 검색창에 "강남" 입력
2. 검색 버튼 클릭
3. 네트워크 요청 캡처:
   - URL: /cs/ajax/shop_search
   - Method: POST
   - Headers: Cookie, Referer, X-Requested-With
   - Body: name_address=강남
   - Response: HTML 또는 JSON
```

**시나리오 B: 지역 선택**
```
1. 시/도 드롭다운에서 "서울특별시" 선택
2. 네트워크 요청 캡처:
   - URL: /cs/ajax/sido_search
   - Headers 확인
3. 시/군/구 드롭다운에서 "강남구" 선택
4. 네트워크 요청 캡처:
   - URL: /cs/ajax/gugun_search
   - Body: sido=서울특별시
```

### 4단계: 요청 정보 분석

**확인 사항:**
1. ✅ 쿠키 필요 여부
   - 어떤 쿠키가 설정되는가?
   - PHPSESSID, JSESSIONID 등?
   - 쿠키 없이 요청 가능한가?

2. ✅ 필수 헤더
   - X-Requested-With: XMLHttpRequest
   - Referer: https://www.daiso.co.kr/cs/shop
   - Content-Type
   - 기타 커스텀 헤더

3. ✅ CSRF 토큰
   - 폼에 숨겨진 토큰이 있는가?
   - 헤더에 CSRF 토큰이 있는가?

4. ✅ 응답 형식
   - JSON인가 HTML인가?
   - 데이터 구조는?

### 5단계: 리플레이 테스트

**캡처한 정보로 curl 재현:**
```bash
curl "https://www.daiso.co.kr/cs/ajax/shop_search" \
  -X POST \
  -H "Cookie: [캡처한 쿠키]" \
  -H "Referer: https://www.daiso.co.kr/cs/shop" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d "name_address=강남"
```

**성공 판단:**
- ✅ JSON/HTML 응답 받음
- ✅ 매장 데이터 포함
- ❌ 로그인 페이지로 리다이렉트
- ❌ 빈 응답 또는 에러

---

## Playwright 명령 예시

### 기본 페이지 열기
```typescript
// 브라우저 실행 및 페이지 열기
await playwright.navigate("https://www.daiso.co.kr/cs/shop");

// 스크린샷 촬영
await playwright.screenshot();

// 쿠키 확인
await playwright.execute(`
  return document.cookie;
`);
```

### 네트워크 요청 캡처
```typescript
// 네트워크 리스너 설정 (JavaScript로)
await playwright.execute(`
  window.capturedRequests = [];

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    window.capturedRequests.push({
      url: args[0],
      options: args[1],
      timestamp: Date.now()
    });
    return originalFetch.apply(this, args);
  };

  const originalXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    window.capturedRequests.push({
      method: method,
      url: url,
      timestamp: Date.now()
    });
    return originalXHR.apply(this, arguments);
  };
`);
```

### 폼 입력 및 제출
```typescript
// 검색어 입력
await playwright.fill('input[name="name_address"]', '강남');

// 검색 버튼 클릭
await playwright.click('button[type="submit"]');

// 잠시 대기 (응답 기다림)
await playwright.execute(`
  return new Promise(resolve => setTimeout(resolve, 2000));
`);

// 캡처된 요청 확인
await playwright.execute(`
  return window.capturedRequests;
`);
```

---

## 예상 결과

### 시나리오 1: 세션 쿠키 필수 ❌

**발견 사항:**
- PHPSESSID 등의 쿠키가 필수
- 쿠키 없이는 HTML 페이지 반환
- 리플레이 세션 어려움

**대응:**
- 세션 자동 생성 로직 필요
- Puppeteer/Playwright 필수

### 시나리오 2: 쿠키 불필요, 헤더만 필요 ✅

**발견 사항:**
- X-Requested-With, Referer만 필요
- JSON 응답 정상 수신
- 리플레이 세션 가능!

**대응:**
- HTTP 클라이언트로 구현 가능
- Cloudflare Workers에서 작동

### 시나리오 3: CSRF 토큰 필요 ⚠️

**발견 사항:**
- 페이지에서 토큰 추출 필요
- 토큰 갱신 로직 필요
- 부분적 리플레이 가능

**대응:**
- 먼저 페이지 방문 → 토큰 추출
- 토큰 포함하여 API 호출

---

## 다음 단계

1. **세션 재시작**
   ```bash
   # Claude Code 종료 후 재시작
   # Playwright MCP 도구 활성화 확인
   ```

2. **Playwright로 페이지 열기**
   ```
   다이소 매장 검색 페이지 방문
   네트워크 캡처 활성화
   ```

3. **검색 실행 및 분석**
   ```
   매장 검색 수행
   네트워크 요청 분석
   필요한 헤더/쿠키 파악
   ```

4. **리플레이 테스트**
   ```
   curl로 요청 재현
   성공 여부 확인
   ```

5. **결과 문서화**
   ```
   성공 시: HTTP 클라이언트 구현 가능
   실패 시: Puppeteer 필요
   ```

---

## 도구 준비 완료

- ✅ `.mcp.json` - Playwright MCP 서버 설정
- ✅ `.claude/settings.local.json` - 자동 승인 활성화
- ⏳ Claude Code 재시작 필요

**다음 명령:**
세션 재시작 후 Playwright로 `https://www.daiso.co.kr/cs/shop` 페이지를 열어 분석을 시작합니다.
