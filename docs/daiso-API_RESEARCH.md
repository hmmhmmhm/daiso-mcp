# 다이소 API 조사 결과

## 조사 일자
2026-02-28

## 다이소 공식 웹사이트 분석

### 1. 주요 사이트

- **다이소 공식 홈페이지**: https://www.daiso.co.kr/
- **다이소몰 (온라인 쇼핑)**: https://www.daisomall.co.kr/
- **영문 사이트**: https://eng.daiso.co.kr/

### 2. 매장 검색 API

**엔드포인트**: `https://www.daiso.co.kr/cs/ajax/shop_search`

**기능**:
- 매장명으로 검색
- 지역별 검색 (시도 → 시군구 → 읍면동)
- 편의시설 필터링 (주차, 출입구, 엘리베이터)
- 서비스 필터링 (현금없는매장, 스티커, 심카드 등)

**관련 엔드포인트**:
- `/cs/ajax/sido_search` - 시도 목록 조회
- `/cs/ajax/gugun_search` - 시군구 목록 조회

**지도 API**: Kakao Maps API 사용

### 3. 제품 검색 API (다이소몰)

**기본 구조**: Nuxt.js 기반 SPA

**제품 조회 엔드포인트 패턴**:
```
/GoodsHot?searchQuery=R2&searchSort=order&soldOutYn=N&pageNum=1&cntPerPage=20
```

**파라미터**:
- `searchQuery`: 검색 쿼리 또는 카테고리 코드
- `searchSort`: 정렬 방식 (order, price 등)
- `soldOutYn`: 품절 상품 제외 여부 (Y/N)
- `pageNum`: 페이지 번호
- `cntPerPage`: 페이지당 상품 수

### 4. 제품 카테고리

다이소몰에서 확인된 주요 카테고리:
- 스킨케어
- 바디케어
- 팩/마스크
- 헤어케어
- 메이크업
- 네일케어
- 향수/방향제
- 주방/생활
- 문구
- 완구/취미
- 화장품/미용

## 공식 API 제공 여부

### 결론: 공식 API 없음

다이소는 현재 **공개된 공식 API를 제공하지 않습니다**.

**확인 방법**:
- 공식 웹사이트에서 개발자 문서나 API 문서를 찾을 수 없음
- 검색 엔진에서 "daiso API", "다이소 API" 검색 시 관련 문서 없음

**대안**:
1. 다이소에 직접 문의 (webmaster@daiso.co.kr / 1522-4400)
2. 웹 스크래핑 (법적 검토 필요)
3. 목업 데이터 사용 (현재 구현)

## 데이터 수집 방법 검토

### 방법 1: 웹 스크래핑

**장점**:
- 실시간 데이터 수집 가능
- 공식 웹사이트의 정확한 정보

**단점**:
- 법적 문제 발생 가능 (이용약관 확인 필요)
- 웹사이트 구조 변경 시 스크래퍼 수정 필요
- 서버 부하 발생 우려
- IP 차단 위험

**주의사항**:
- robots.txt 확인: https://www.daiso.co.kr/robots.txt
- 이용약관 확인
- Rate limiting 필수
- User-Agent 설정

### 방법 2: 공식 제휴 문의

**문의처**:
- 이메일: webmaster@daiso.co.kr
- 전화: 1522-4400
- 온라인몰 고객센터: 1599-2211
- 온라인몰 이메일: daisomall_official@daiso.co.kr

**제안 내용**:
- MCP 서버를 통한 다이소 정보 제공 서비스 개발 계획 설명
- API 제공 가능 여부 문의
- 데이터 사용 권한 협의

### 방법 3: 크롤링 없이 사용자 입력 기반

**구현**:
- 사용자가 직접 제품명, 매장명 등을 입력
- 다이소 웹사이트로 리다이렉트 또는 링크 제공
- 제한적인 정보만 제공

### 방법 4: 커뮤니티 데이터 수집

**출처**:
- 사용자 기여 데이터
- 크라우드소싱 방식
- 제한적이지만 법적으로 안전

## 추천 방안

### 단기 (현재):
1. **목업 데이터 사용** (현재 구현 상태 유지)
2. **제한적 기능 제공**
   - 다이소 공식 사이트 링크 제공
   - 매장 검색은 다이소 공식 페이지로 리다이렉트

### 중기:
1. **공식 제휴 시도**
   - 다이소에 API 제공 요청
   - 비즈니스 제휴 가능성 타진

2. **합법적 데이터 수집**
   - 이용약관 확인 후 스크래핑 가능 여부 검토
   - robots.txt 준수
   - Rate limiting 적용

### 장기:
1. **자체 데이터베이스 구축**
   - 사용자 기여 데이터
   - 크라우드소싱
   - 데이터 검증 시스템

## 기술 스택 검토

### 스크래핑 시 필요한 기술

```typescript
// Cloudflare Workers에서 HTML 파싱
// htmlrewriter 또는 cheerio-like 라이브러리 사용

// 예시
async function scrapeProducts(url: string) {
  const response = await fetch(url);
  const html = await response.text();

  // HTML 파싱 및 데이터 추출
  // ...
}
```

### 캐싱 전략

```typescript
// Cloudflare KV를 사용한 캐싱
// 매장 정보는 1일 캐시
// 제품 정보는 1시간 캐시

interface CacheConfig {
  storeCache: 86400,    // 1일
  productCache: 3600,   // 1시간
  priceCache: 1800,     // 30분
}
```

## robots.txt 분석 결과

### daiso.co.kr (공식 홈페이지)

```
User-agent: *
Disallow: /common/
Disallow: /assets/
Disallow: /upload/
Allow: /
```

**분석**:
- 대부분의 경로 허용
- `/common/`, `/assets/`, `/upload/` 디렉토리만 차단
- 매장 검색(`/cs/shop`), AJAX 엔드포인트 등은 크롤링 가능

### daisomall.co.kr (온라인 쇼핑몰)

```
User-agent: Googlebot
Allow: /

User-agent: Yeti
Allow: /
Crawl-delay: 10

User-agent: Daum
Allow: /
Crawl-delay: 10

User-agent: Bingbot
Allow: /
Crawl-delay: 30

User-agent: facebookexternalhit
Allow: /
Crawl-delay: 30

User-agent: *
Disallow: /
Crawl-delay: 60
```

**분석**:
- **일반 크롤러는 모든 경로 차단** (`User-agent: *` → `Disallow: /`)
- 검색엔진 봇(Googlebot, Yeti, Daum, Bingbot)만 허용
- **제품 정보 크롤링은 제한됨**

### 결론

1. **다이소 공식 홈페이지 (daiso.co.kr)**:
   - 매장 정보 크롤링은 기술적으로 가능
   - 단, 이용약관 확인 필요

2. **다이소몰 (daisomall.co.kr)**:
   - **robots.txt에서 일반 크롤러 명시적 차단**
   - 제품 정보 스크래핑은 적합하지 않음
   - 공식 API 또는 제휴 필요

## 법적 검토 사항

### 확인 필요:
1. ✅ robots.txt 내용 (확인 완료)
2. 다이소 웹사이트 이용약관
3. 저작권법상 데이터베이스 권리
4. 개인정보보호법 (사용자 데이터 수집 시)

### 리스크:
- **다이소몰은 robots.txt에서 크롤링 명시적 차단**
- 무단 크롤링 시 법적 문제 발생 가능
- 서비스 약관 위반 시 접근 차단
- 상업적 이용 시 추가 제약

### 권장사항:
- 다이소몰 제품 정보는 스크래핑 대신 **공식 제휴 또는 API 요청**
- 매장 정보는 이용약관 검토 후 신중히 접근
- 목업 데이터 사용이 가장 안전한 현재 방안

## 다음 단계

1. [ ] robots.txt 확인
2. [ ] 이용약관 검토
3. [ ] 다이소 공식 제휴 문의 이메일 발송
4. [ ] 법적 검토 (필요 시 변호사 상담)
5. [ ] 스크래핑 PoC 구현 (합법성 확인 후)
6. [ ] 사용자 기여 데이터 시스템 설계

## 참고 자료

### 검색 결과:
- [다이소몰 앱 (Google Play)](https://play.google.com/store/apps/details?id=com.uxlayer.wipoint&hl=en_US)
- [다이소 공식 사이트](https://www.daiso.co.kr/)
- [다이소 매장검색](https://www.daiso.co.kr/cs/shop)
- [다이소몰 온라인 쇼핑](https://www.daisomall.co.kr/)
- [매장 상품 찾기](https://www.daisomall.co.kr/ms/msg/SCR_MSG_0015)

### 관련 기술:
- Kakao Maps API (다이소 매장 검색에 사용)
- Nuxt.js (다이소몰 프론트엔드)
- Google Tag Manager (분석)

## 업데이트 로그

- 2026-02-28: 초기 조사 완료
