# Relay Observability Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated implementation and review.

**Goal:** OY 반복 upstream 호출을 절감하고 디스크 안전 추적을 배포한다.
**Architecture:** bounded relay cache + 공통 로컬 JSONL logger + Worker request context.
**Tech Stack:** TypeScript, Node24, Hono, Cloudflare Workers, Vitest.

- [x] Task 1: scripts/relay/cache.ts, quota.ts, oliveyoung.ts와 tests/relay 확장. 동일 요청 3회 차감1, 동시합치기, TTL/용량 퇴출, 오류미저장, abort/queue/권한 회귀를 먼저 재현한다. quota 함수의 boolean 계약 유지하며 status()로 분/일 원인과 Retry-After를 얻는다.
- [x] Task 2: scripts/relay/logging.ts + tests/relay. 고정 schema append(event), flush(), status() API. 4MiB rotation/64MiB retention/7일/2GiB reserve/256 pending/2KiB event. statfs/IO는 주입해서 디스크부족과 ENOSPC, restart 파일 정리를 검증한다. start.ts,dtryx-start.ts 연결은 root가 수행한다.
- [x] Task 3: src/utils/diagnostics.ts, src/index.ts, core/registry.ts, utils/http.ts, relay transports. request-scoped context에서 경계 기록 및 ID 전달. src/api/routes/oliveyoungRoutes.ts 키 정규화. Worker config logs 설정. 테스트는 개인정보 미노출·동시 context 격리·오류 기록·기존 응답 계약 보존.
- [x] Task 4: 루트에서 start/lifecycle/Dtryx integration, 운영 문서, 전체 npm run check / build / test:coverage, 독립 spec/quality review 및 수정.
- [ ] Task 5: PR 생성 및 CI 확인 후 병합. Mac runtime 복사/원자적 교체·LaunchAgent 재시작, Worker 배포 확인, REST/MCP 실조회 및 로그 상관/권한/크기/캐시절감 확인. 운영상태 기록.
