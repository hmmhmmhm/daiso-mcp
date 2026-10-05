# 동일 중계 조회 병합 구현 계획

> **For agentic workers:** 이번 세션은 executing-plans로 순서대로 구현·검토합니다.

**Goal:** 캐시 가능한 동일한 편의점 조회의 동시 요청을 한 원본 작업으로 병합합니다.

**Architecture:** 인증·입력 검증·각 요청의 15초 기한과 32개 접수 상한을 유지합니다. 검증된 canonicalKey별 진행 작업은 별도 AbortController와 15초 기한을 가지며, 마지막 대기자가 떠나면 취소합니다. 성공 JSON만 기존 TTL 캐시에 저장하고 작업 완료/실패/전체 취소 후 진행 맵을 정리합니다. 캐시 없는 작업은 병합하지 않습니다.

**Tech Stack:** TypeScript, Node AbortController, Vitest.

## 순서

- [x] tests/relay/http-relay-coalescing.test.ts: 동시20개 원본1회·예산1회, 응답 body 독립, 실패 후 재조회, 개별/전체 취소, 시간 초과, 다른 상품/지역 격리, 인증/입력 검증과 접수 상한 유지의 실패 테스트를 작성합니다.
  - `npm test -- tests/relay/http-relay-coalescing.test.ts`에서 원본20회 등 기대 실패를 확인합니다.
  - 핵심 단언: `expect(upstream).toHaveBeenCalledTimes(1); expect(takeQuota).toHaveBeenCalledTimes(1);`.
- [x] scripts/relay/http-relay.ts: `Map<string, SharedWork>`에 검증된 작업을 보관하고 `abortable(work.result, caller.signal)`로 각 요청을 분리합니다. `work.waiters--` 후 0이고 미완료이면 맵에서 제거하고 작업을 취소합니다. 원본 작업 내부에서 acquire·quota·abortable upstream·JSON 직렬화·cache를 수행하고 finally에서 타이머·활성 슬롯·맵을 해제합니다.
- [x] `npm test -- tests/relay`, `npm run check`, `npm run test:coverage`, `npm run build`로 회귀·100% 커버리지를 검증합니다. 모의100요청은 기존32접수 상한을 유지하므로 전부200을 요구하지 않고 접수된 동일 조회의 원본1회와 초과503을 검증합니다.
- [x] docs/convenience-relay.md에 병합·취소·실패·TTL·상한 동작을 설명하고 코드 리뷰 후 커밋·PR을 작성합니다. 공개 운영/GS 원본 부하 테스트나 GS 인증 우회는 하지 않습니다. 정상 API 인증 경로가 미확보면 GS 고유 대량 조회는 미해결로 명시합니다.

검증: 기존70개 baseline 통과, 신규11개 회귀와 전체2,350개 통과. check/build 성공, coverage4항목100%. 독립리뷰2회 결함없음. 마지막 단계의 코드/문서는 완료됐으며 PR 발행은 이 기록 커밋 직후 수행합니다.
