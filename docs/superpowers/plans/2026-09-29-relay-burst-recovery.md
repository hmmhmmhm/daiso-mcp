# Relay Burst Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Zyte 없이 소비자 429와 브라우저 교체 중 취소를 줄인다.
**Architecture:** 기존 bounded relay의 소비자 예산·busy 사유를 조정하고 transport 한곳에서 deadline 안의 단일 busy 재시도를 처리한다. 브라우저 수와 전역 예산 유지.
**Tech Stack:** TypeScript, Vitest, Cloudflare Worker, Node24, Playwright.

## Task 1: 소비자 분류 및 대기 시간

- [x] `tests/relay/consumer.test.ts`, `fairness.test.ts`, `oliveyoung.test.ts`에서 24실행 후25번째 거절, consumer-busy 1초, 23초 queued성공/30초 만료, 취소 분리 테스트를 먼저 추가하고 실패 확인.
- [x] `scripts/relay/consumer.ts`의 예약 상한을24로, `oliveyoung.ts`의 admission 실패 응답을consumer-busy/1초로 분리. queue cutoff30000. 취소는 queue/canceled, 대기초과는queue/expired. 기존 취소 응답503과 예약해제 유지.
- [x] `scripts/relay/logging.ts` 고정 reason/outcome 목록에 새로운 분류 추가, 민감정보 미기록 테스트 유지.

## Task 2: Worker 단일 busy 재시도

- [x] `tests/utils/relayQuota.test.ts`, `tests/services/oliveyoung/cooldown.test.ts`에 consumer-busy의 scope격리, 한 번만 retry, timeout합산, timeout짧을때 미재시도, 잘못된응답미재시도, cachedbusy복구 테스트 RED.
- [x] `src/utils/relayQuota.ts`에 consumer-busy 허용 및 소비자 scope. `src/services/oliveyoung/transport.ts`에서 relay기본60000/direct15000, 호출시작 기준 remaining deadline으로 fetch timeout설정. 검증된 busy만 1000ms이하 기다려 한번재호출, 다른원인은 기존동작 유지. HttpError→ServiceError diagnostics 경로 유지.
- [x] 신규 분류의 REST/MCP 전달·Zyte 비호출·bounded cleanup 테스트. 모든 변경 파일 coverage100%.

## Task 3: 통합 검증 및 배포

- [ ] 독립 spec/code review, npm run check/build/test:coverage/audit. package 1.2.8 및 운영 문서 갱신.
- [ ] PR CI 확인 후 병합, Worker 및 맥 runtime 교체(이전 runtime rollback보존), npm tag와 publish 일치 확인.
- [ ] 적은 수의 live REST/MCP, health, 브라우저 소유 그룹, 디스크·로그 상태 확인. 기존 알려진 degraded와 실제 실패 구분. 완료 푸시 및 요약.
