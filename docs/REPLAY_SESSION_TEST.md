# 다이소 리플레이 세션 테스트 결과

## 테스트 일자
2026-02-28

## 목적
Puppeteer 없이 HTTP 요청만으로 다이소 데이터를 스크래핑할 수 있는지 검증

---

## 테스트 결과 요약

### ❌ 세션 기반 인증 필요

**결론**: 다이소 AJAX API는 **브라우저 세션 쿠키가 필수**입니다.

---

## 발견한 API 엔드포인트

### 1. 위치 기반 매장 검색

**엔드포인트**: `GET https://www.daiso.co.kr/cs/ajax/shop_search`

**파라미터**:
```
lat: 위도 (예: 37.5665)
lng: 경도 (예: 126.9780)
mal_level: 지도 레벨 (예: 5)
```

**소스 코드**:
```javascript
$.ajax({
  url: "./ajax/shop_search",
  data: {lat:lat, lng:lng, mal_level:map.getLevel()},
  type: "get",
  success: function(result) {
    ajaxResult(result);
  }
});
```

**테스트 결과**: HTML 페이지 반환 (세션 없음)

---

### 2. 이름/주소 기반 매장 검색

**엔드포인트**: `POST https://www.daiso.co.kr/cs/ajax/shop_search`

**파라미터**:
```
name_address: 검색어 (매장명 또는 주소)
sido: 시/도 (선택)
gugun: 시/군/구 (선택)
dong: 읍/면/동 (선택)
opt_search: 편의시설 필터 (선택)
```

**소스 코드**:
```javascript
$.ajax({
  url: "./ajax/shop_search",
  data: param, // 폼 직렬화 데이터
  success: function(result) {
    ajaxResult(result);
  }
});
```

**테스트 결과**: HTML 페이지 반환 (세션 없음)

---

### 3. 시도 목록 조회

**엔드포인트**: `POST https://www.daiso.co.kr/cs/ajax/sido_search`

**파라미터**: 없음

**테스트 결과**: 빈 배열 `[]` 반환

---

### 4. 시군구 목록 조회

**엔드포인트**: `POST https://www.daiso.co.kr/cs/ajax/gugun_search`

**파라미터**:
```
sido: 시/도명 (예: "서울특별시")
```

**테스트 결과**: 테스트 필요 (세션 쿠키 필요 예상)

---

## 왜 실패했는가?

### 1. 세션 쿠키 필요

다이소 웹사이트는 AJAX API 호출 시 **브라우저 세션을 검증**합니다.

```bash
# curl 요청 시
curl "https://www.daiso.co.kr/cs/ajax/shop_search?lat=37.5665&lng=126.9780&mal_level=5"
# → HTML 페이지 반환 (로그인 페이지 또는 메인 페이지)

# 브라우저에서 요청 시
# → JSON 또는 HTML 결과 반환 (매장 데이터 포함)
```

### 2. 브라우저 환경 필요

다이소 웹사이트는 다음을 검증하는 것으로 추정:
- ✅ 세션 쿠키 (PHPSESSID, JSESSIONID 등)
- ✅ Referer 헤더 (`https://www.daiso.co.kr/cs/shop`)
- ✅ User-Agent
- ⚠️ CSRF 토큰 (가능성 있음)
- ⚠️ 기타 보안 헤더

---

## 리플레이 세션 시도

### 방법 1: 브라우저에서 쿠키 추출

**단계**:
1. 브라우저에서 https://www.daiso.co.kr/cs/shop 방문
2. 개발자 도구 → Application → Cookies
3. 쿠키 값 복사
4. curl에 쿠키 포함하여 요청

**예시**:
```bash
curl "https://www.daiso.co.kr/cs/ajax/shop_search?lat=37.5665&lng=126.9780&mal_level=5" \
  -H "Cookie: PHPSESSID=abc123..." \
  -H "Referer: https://www.daiso.co.kr/cs/shop"
```

**문제점**:
- 쿠키는 시간이 지나면 만료됨
- 매 요청마다 새로운 세션 필요
- 자동화 어려움

---

### 방법 2: 세션 자동 생성

**아이디어**:
1. 먼저 메인 페이지 방문 → 세션 쿠키 획득
2. 쿠키를 저장
3. API 요청 시 저장된 쿠키 사용

**TypeScript 예시**:
```typescript
async function fetchWithSession(url: string) {
  // 1. 세션 획득
  const mainPage = await fetch('https://www.daiso.co.kr/cs/shop');
  const cookies = mainPage.headers.get('set-cookie');

  // 2. API 요청 (쿠키 포함)
  const response = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'Referer': 'https://www.daiso.co.kr/cs/shop'
    }
  });

  return response;
}
```

**문제점**:
- Cloudflare Workers는 `set-cookie` 헤더 접근 제한
- 쿠키 관리 복잡
- 세션 유지 어려움

---

## 브라우저 테스트 도구

실제 브라우저에서 작동하는지 확인하기 위한 HTML 파일을 제공합니다.

**파일**: `tools/replay-session-test.html`

**사용 방법**:
1. 브라우저에서 파일 열기
2. 각 버튼 클릭하여 API 테스트
3. 개발자 도구 (F12) → Network 탭에서 실제 요청 확인
4. 성공한 요청을 "Copy as cURL"로 복사

---

## 결론

### ❌ Puppeteer 없이 리플레이 세션만으로는 **불충분**

**이유**:
1. **세션 쿠키 필수** - 브라우저 방문 없이는 얻을 수 없음
2. **쿠키 관리 복잡** - Cloudflare Workers에서 제한적
3. **세션 만료** - 지속적인 갱신 필요
4. **자동화 어려움** - 안정적인 데이터 수집 불가

### ⚠️ 부분적 성공 가능성

**조건**:
- 브라우저에서 먼저 세션 쿠키 획득
- 쿠키를 수동으로 관리
- 짧은 시간 내 데이터 수집

**적합한 상황**:
- 일회성 데이터 수집
- 테스트 목적
- 소규모 스크립트

**부적합한 상황**:
- 프로덕션 서비스 ❌
- 실시간 데이터 제공 ❌
- Cloudflare Workers ❌

---

## 대안 방안

### ✅ 1. Puppeteer/Playwright (권장)

**장점**:
- 완전한 브라우저 환경
- 자동 세션 관리
- 안정적인 스크래핑

**단점**:
- Cloudflare Workers에서 사용 불가
- 별도 서버 필요
- 리소스 사용량 많음

**구조**:
```
별도 서버 (Puppeteer) → 스크래핑 → Cloudflare D1/KV 저장
                                        ↓
                              Cloudflare Workers → 데이터 제공
```

---

### ✅ 2. 외부 스크래핑 서비스

**서비스**:
- Apify
- ScrapingBee
- Browserless

**장점**:
- 관리형 서비스
- 안정적
- 스케일 가능

**단점**:
- 유료
- API 호출 제한
- 외부 의존성

---

### ✅ 3. 공식 API 제휴 (최우선 권장)

**연락처**:
- webmaster@daiso.co.kr
- 1522-4400

**장점**:
- 합법적
- 안정적
- 공식 지원

---

### ✅ 4. 목업 데이터 유지 (현재)

**장점**:
- 가장 안전
- 법적 문제 없음
- Cloudflare Workers에서 작동

**단점**:
- 실제 데이터 아님

---

## 최종 권장사항

### 단기 (현재)
**목업 데이터 사용** - 안전하고 합법적

### 중기 (1-3개월)
**공식 API 제휴 시도** - 다이소에 문의

### 장기 (필요시)
**하이브리드 접근**:
1. Puppeteer로 주기적 스크래핑
2. Cloudflare D1/KV에 데이터 저장
3. Workers에서 캐시된 데이터 제공

---

## 테스트 파일

| 파일 | 용도 |
|------|------|
| `tools/replay-session-test.html` | 브라우저 테스트 도구 |
| `tools/test-replay.js` | Node.js 테스트 스크립트 |

---

## 참고 자료

- 다이소 매장 검색: https://www.daiso.co.kr/cs/shop
- jQuery AJAX 문서: https://api.jquery.com/jquery.ajax/
- Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
