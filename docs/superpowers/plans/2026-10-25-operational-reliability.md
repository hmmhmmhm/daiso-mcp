# 운영 안정성 구현 계획

> 구현 스킬: superpowers:subagent-driven-development. 각 작업은 회귀 검증과 독립 검토를 거친다.

**Goal:** 실제 사용자 호출 검사와 Mac 운영 재현성을 개선하고 인증·원본 제한을 지속적으로 관리한다.
**Architecture:** 공개 도구 계약과 기존 중계를 유지하며 운영 모듈과 설치 보조 기능만 확장한다.
**Tech Stack:** TypeScript, Vitest, Python 표준 라이브러리, AppKit Swift, launchd.

## 1. 공개 MCP 서비스 검사 확대

- 수정: scripts/ops/mcp-smoke.ts, scripts/ops/mcp-smoke-validation.ts, .github/workflows/external-smoke.yml.
- 검사: tests/scripts/mcp-smoke*.test.ts, cinema-smoke.test.ts.
- [x] 빠진 서비스의 실제 공개 호출과 상품·매장 재고 증거를 거절/수용하는 회귀를 먼저 작성한다.
- [x] `npx vitest run tests/scripts`로 실패 재현 후 최소 구현한다.
- [x] 모든 서비스가 워크플로에 포함되고 도구10개·카탈로그·기존 상품명 조회가 유지되는지 확인한다.

## 2. GS 인증 상시 준비·안전한 상태

- 수정: scripts/relay/gs25-session.ts, dtryx-start.ts.
- 검사: tests/relay/gs25-session.test.ts 및 신규 상태·주기 준비 회귀.
- [x] stock fetch 없이 prepare/status를 호출하고 만료·정상갱신·일시실패 backoff·중복갱신을 검증한다.
- [x] 실패 전용 테스트를 실행한 후 transport에 준비·상태 메서드를 추가한다.
- [x] 분당 준비와 health 노출을 연결하며 shutdown 뒤 추가 갱신을 막는다.

## 3. Mac 사용자 범위 운영 도구

- 생성: scripts/relay/macos-ops.py, scripts/relay/hide-oliveyoung.swift.
- 검사: tests/scripts/macos-ops.test.ts 및 실제 macOS 빌드·소유검증.
- [x] plan/status/apply/watch 설정의 임의 URL·인증 출력·기존파일 덮어쓰기를 막는 테스트를 작성한다.
- [x] 전용 숨김 작업과 loopback 상태 스냅샷 감시를 등록한다. 감시는 인증된 로컬 health·GS 인증 상태·설정된 터널 ready만 읽는다.
- [x] 실패를 재고0이나 정상으로 바꾸지 않고 private 상태 파일에 기록한다. 인증·원장은 변경하지 않는다.

## 4. 원본 진입 제한

- 수정: scripts/relay/daiso-jp.ts.
- 검사: tests/relay/daiso-jp.test.ts.
- [x] 다른 상품 동시 요청에서 첫429 후 원본 추가 호출이 없어야 하는 회귀를 작성한다.
- [x] 기존 HTTP 계층의 동일 요청 공유·취소를 유지하며 원본 호출만 직렬화한다.
- [x] deadline·취소·성공 후 제한 해제·Retry-After와 자체quota 구분을 검증한다.

## 5. 통합·배포

- [ ] `npm run check`, `npm run test:coverage`, `npm run build` 통과.
- [ ] 기능 요구 검토 후 코드 품질 검토, 지적 수정 및 재검증.
- [ ] 논리 단위 커밋과 PR, GitHub 검사 성공 후 병합·배포.
- [ ] Mac 유휴·정상 종료·원본 백업·SHA 대조 후 변경 파일 반영.
- [ ] 인증된 fresh OY/GS와 실제 MCP/CLI, 감시 상태·숨김·전체 routes 신선도 확인.
- [ ] PROJECT.md에 결과와 실제 남은 문제를 기록한다.
