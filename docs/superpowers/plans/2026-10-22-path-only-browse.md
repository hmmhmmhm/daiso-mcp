# 경로 기반 무설치 웹 조회 구현 계획

**Goal:** 웹 읽기용 모든 조회와 안내를 쿼리 없는 HTML 경로로 전환한다.
**Architecture:** 허용된 읽기 경로의 codec, 내부 API dispatch, 기존 HTML 렌더러와 후속 링크, 발견 안내를 분리한다. JSON API와 MCP 계약은 유지한다.
**Tech Stack:** TypeScript, Hono, Vitest, Cloudflare Workers.

## 1. 경로 변환과 라우트

- [x] `tests/pages/browse.test.ts`에 `/browse/daiso/products/핫식스/pageSize/3` → `/api/daiso/products?q=핫식스&pageSize=3&format=html` 왕복, 모든 지원 읽기 경로, 특수문자, 거절 대상 실패 회귀를 작성한다.
- [x] `npx vitest run tests/pages/browse.test.ts`로 실패를 확인한다.
- [x] `src/pages/browsePaths.ts`에 허용 경로 목록과 변환을 구현한다. `src/pages/browse.ts`에 목록 HTML과 GET 내부 dispatch를 구현하고 `src/index.ts`에 등록한다.
- [x] 동일 테스트를 통과하고 실제 API 입력·오류·호출 제한의 동등성 회귀를 추가한다.
- [x] `git commit -m 'feat: 쿼리 없는 웹 조회 경로 추가'`.

## 2. 실제 결과와 후속 링크

- [x] `tests/pages/apiResult.test.ts`, `productCards.test.ts`에 실제 상품 상세·재고·페이지 링크가 `/browse/`이고 쿼리가 없다는 실패 회귀를 추가한다.
- [x] `src/pages/apiResult.ts`에서 요청·후속 링크를 경로 방식으로 표시하고 데이터·이미지·오류·보안 헤더는 유지한다.
- [x] 테스트를 실행하고 `git commit -m 'feat: HTML 조회 후속 링크를 경로 방식으로 통일'`.

## 3. 안내 전환

- [x] pages 테스트에 첫 링크 및 모든 웹 조회 예시가 browse라는 실패 회귀를 추가한다.
- [x] `src/pages/agentStart.ts`, `discovery.ts`, `prompt*.ts`, README, 웹 사용 docs를 갱신한다. 안내 버전은 `2026-10-22.1`로 올린다. 기존 ALIGNS 접근성 기준은 이번 승인 범위인 browse 우선과 구형 HTML 하위호환을 반영한다.
- [x] `npm run build:discovery`로 정적 발견 파일을 재생성하고 `git commit -m 'docs: 무설치 웹 조회 안내를 browse 경로로 전환'`.

## 4. 통합과 운영

- [x] `npm run check`, `npm run test:coverage`, `npm run build`, `npm run build:discovery`, `git diff --check`를 실행한다.
- [ ] 독립 코드 리뷰 후 PR을 생성·첨부하고 모든 GitHub 필수 검사를 확인한다.
- [ ] 병합·배포 후 상품 검색·후속 재고·기존 JSON·MCP 10개·CLI를 검증한다. 웹 URL 직접 열기와 링크 이동의 결과를 구분한다.
- [ ] 개인 PROJECT.md에 근거·검증·외부 제한을 기록한다.
