# 올리브영 Playwright MCP 연동 및 실측 진행 가이드

## 문서 목적

- Playwright MCP 연동 이후, 올리브영 실측 분석을 어떤 순서로 진행할지 정의합니다.
- 목표는 **Puppeteer 없이 리플레이 가능한 요청 조합**을 찾는 것입니다.

## 1) Playwright MCP 연동 확인

### 필수 파일

- `.mcp.json`에 Playwright MCP 서버 등록
- `.claude/settings.local.json`에 `enableAllProjectMcpServers: true` 설정

### 체크리스트

- Claude Code 세션 재시작 완료
- 도구 목록에 Playwright 관련 MCP 도구 노출 확인
- 대상 URL 접속 가능 여부 확인: `https://www.oliveyoung.co.kr/`

## 2) 실측 분석 기준 (반드시 준수)

- 브라우저 기반 실측만 사용 (단순 추정 금지)
- 최소 3회 반복 측정 (요청/응답 일관성 확인)
- 각 요청별 아래 항목 기록
  - URL, Method, Query, Body
  - 필수 헤더 (`referer`, `origin`, `content-type`, 기타 커스텀 헤더)
  - 쿠키 필요 여부
  - 응답 형식(JSON/HTML), 핵심 필드
  - 실패 시 에러 코드/차단 패턴 (예: Cloudflare challenge)

## 3) 분석 시나리오

### 시나리오 A: 매장 검색

- 페이지 진입
- 위치 기반/키워드 기반 매장 검색 동작 수행
- 네트워크 요청 중 매장 목록 API 후보 추출

### 시나리오 B: 상품 검색

- 검색어 입력 후 결과 로딩 요청 추출
- 페이지네이션/정렬/필터 요청 파라미터 변화 관찰

### 시나리오 C: 재고 조회

- 특정 상품 선택 후 재고 조회 동작 수행
- 매장별 재고 수량, 품절 상태 필드 구조 파악

## 4) 리플레이 검증 절차 (핵심)

### 1차 검증

- 캡처된 요청을 `curl`로 그대로 재현
- 응답이 정상 데이터인지 확인

### 2차 최소화 검증

- 헤더/쿠키를 하나씩 제거하여 최소 조건 도출
- 최종적으로 아래 중 어디에 해당하는지 분류
  - A. 쿠키 불필요 + 필수 헤더만 필요
  - B. 세션 쿠키 필요
  - C. 토큰/동적 파라미터 필요
  - D. 브라우저 런타임 의존(리플레이 난이도 높음)

### 3차 안정성 검증

- 동일 요청 10회 반복 시 성공률 확인
- 성공률 90% 미만이면 원인(차단/만료/레이스) 기록

## 5) 구현 결정 규칙

- A 유형: Cloudflare Workers `fetch` 기반 구현
- B/C 유형: 세션/토큰 획득 단계 포함한 2-step 설계
- D 유형: 서버 배포형 자동화 지양, 대안 경로(공식 API/제휴 API) 검토

## 6) 산출물 (docs/에 추가할 파일)

- `docs/oliveyoung-playwright-network-analysis.md`
  - 실측 로그 요약, 엔드포인트 표, 필수 헤더/쿠키 표
- `docs/oliveyoung-network-analysis-result.md`
  - 리플레이 성공/실패 결론, 구현 가능성 판정
- `docs/oliveyoung-replay-session-test.ts`
  - 재현 스크립트
- `docs/oliveyoung-replay-session-test.html` (선택)
  - 브라우저 수동 검증용 페이지

## 7) 완료 조건 (Definition of Done)

- 최소 1개 이상 재고 관련 요청 리플레이 성공
- 성공 요청의 최소 헤더/쿠키 조건 문서화 완료
- 실패 케이스 및 차단 패턴 문서화 완료
- MCP 도구 설계에 필요한 입력/출력 스키마 초안 작성 완료
