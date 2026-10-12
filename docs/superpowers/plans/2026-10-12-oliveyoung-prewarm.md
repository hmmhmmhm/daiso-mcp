# 올리브영 교체 준비 구현 계획

**Goal:** 정상 브라우저를 준비 중인 후속 브라우저 때문에 먼저 회수하지 않는다.

**Architecture:** 고정 소유 슬롯 두 개와 후보 준비 Promise 하나로 수명 관리한다. 기존 guard의 소유권 및 회수 규약을 재사용한다.

**Tech Stack:** TypeScript, Playwright, Node.js, Vitest.

- [x] `tests/relay/lifecycle-prewarm.test.ts`에 준비 중 정상 요청과 후보 실패 보존 테스트를 추가하고 기존 코드에서 실패를 확인한다.
- [x] `scripts/relay/lifecycle.ts`에 현재/후보 분리, API 실행 사이 교환, 준비 및 수명 상한을 구현한다.
- [x] `tests/relay/transport-slots.test.ts`에 두 마커·슬롯 회수·불확실성 테스트를 추가하고 기존 코드에서 실패를 확인한다.
- [x] `scripts/relay/transport-lifecycle.ts`에 두 고정 슬롯과 초기 마커 검사를 구현한다.
- [x] 실행 전 수명 시작과 512 MiB 준비 여유 테스트의 실패를 확인하고 최소 수정을 적용한다.
- [x] 후보/현재 충돌, 종료 중 늦은 실행, 200회 상한, 합계 RSS, 회수 실패 회귀 테스트를 추가한다.
- [ ] `npm run check`, `npm run test:coverage`, `npm run build`를 실행하고 실패 원인을 수정한다.
- [ ] 부모 에이전트에 diff와 검증 결과를 전달하여 리뷰한다. 이 작업에서는 커밋과 운영 배포를 수행하지 않는다.
