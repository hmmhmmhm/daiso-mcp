# 운영 진단·무료 경로 유지보수 계획

> **For agentic workers:** Use superpowers:subagent-driven-development for implementation and independent spec/quality review.

**Goal:** 유료 Zyte를 계속 차단하면서 실제 원인과 중계 준비 상태를 드러내고 검증된 유지보수를 배포한다.
**Architecture:** 기존 Worker 및 전용 Mac 한 탭·guard·Tunnel·Access 설계를 유지한다. 사용자 9/19 전체 개선 승인 범위이며 다시 설계 승인을 요구하지 않는다.
**Tech Stack:** TypeScript, Vitest, Cloudflare Workers, macOS LaunchAgent, Playwright Chromium.

## Task 1: 운영 진단

- [x] tests/utils/zyteJsonFallback.test.ts에서 키가 있어도 원본 HttpError가 보존되고 유료 요청이 없는 회귀 검사를 먼저 실행해 실패 확인.
- [x] src/utils/zyteJsonFallback.ts에서 호환 옵션을 제거해 fetchJson으로 직접 전달하며 원본 오류를 그대로 전달. requestByZyte 전역 차단은 유지.
- [x] src/api/configStatus.ts와 관련 tests에서 OY relay URL/token 및 Access 쌍의 존재 여부만 노출. 값은 절대 출력하지 않으며 설정됨과 도달 가능함을 구분.
- [x] .github/workflows/health-checks.yml에서 모든 실패 ID를 앞에 나열하고 전체 상세를 Actions summary에 기록. 알림 길이 제한에도 마지막 서비스가 누락되지 않게 구성.
- [x] .github/workflows/sync-worker-secrets.yml에 OY 4개 비밀 추가. 빈 값은 기존과 같이 건너뜀.
- [x] targeted tests 및 100% coverage 검증.

## Task 2: 디트릭스 검증

- [x] PR #188 diff와 로컬 두 포트 응답 및 임시 인증 Worker 비교. 고정 API만 호출, 비밀은 출력 금지, 시험 뒤 Worker 삭제.
- [x] 실제 원격 개선 확인 시 #188 반영 및 재검증. 실패하면 근거를 기록하고 원인 미해결로 유지.

## Task 3: 의존성

- [x] npm update로 지원 범위 내 패키지 갱신. npm outdated와 peer 범위로 major 호환성 판단.
- [x] npm run check, npm run test:coverage, npm run build, npm audit. major는 지원범위 밖이면 보류.

## Task 4: 중계 설치

- [ ] 전용 표준 계정과 Cloudflare 인증 확보 여부 확인. 인증 전에는 공개하거나 개인 사용자 계정으로 대체하지 않음.
- [ ] 준비되면 기존 설치 스크립트 검토 후 Tunnel/Access/DNS/Worker secrets 연결. 브라우저 회수/강제 종료/메모리와 미인증 거부 검증.
- [ ] 막힐 경우 바로 실행 가능한 설치 계획 및 정확한 남은 작업을 기록.

## Task 5: 완료 검증

- [ ] 독립 spec review, quality review 후 모든 검사 통과.
- [ ] PR 생성·검증·기존 승인 범위 병합·배포·필요시 npm patch 릴리스. 운영 fresh health 및 Daiso MCP 확인.
- [ ] PROJECT.md 기록 및 완료 알림.

## 실행 결과

- Node 24.15.0에서 1,958개 테스트, coverage 네 지표 100%, check/build/audit 통과. 독립 spec/quality 리뷰 승인.
- Vitest 및 coverage-v8 5.0.1 갱신 검증 완료. TypeScript 7은 peer 지원 범위 밖으로 유지.
- 디트릭스 443 시험 실패로 PR #188 반영 보류, 기존 포트 유지. 임시 Worker 삭제 완료.
- Mac 실제 조회 2건 성공, 부모 SIGKILL 후 추적 Chrome/crashpad 12개 잔여 0. 상시 설치는 전용 계정 및 관리자/Cloudflare 인증 대기.

- 추가 점검에서 CU 웹 매장·GS25 검색의 별도 오류 덮기를 제거하고 CGV 상태 코드를 보존했습니다. 회귀 검사와 독립 delta 리뷰를 적용했습니다.
