# 지오코딩 쿼터 보호 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans for independent tasks.

**Goal:** 반복 실패를 중단하고 정확한 주소 대체 조회를 제공한다.
**Architecture:** 공통 fetch 어댑터, 공급자별 quota gate, 내부 SQLite-backed DO를 분리한다. 성공 좌표 API 응답은 저장하지 않는다.
**Tech Stack:** TypeScript, Cloudflare Durable Objects, Vitest.

- [x] geocodeGate.ts와 단위테스트: quota 판별·보존·만료·동시 병합을 먼저 실패 테스트로 작성한 뒤 구현.
- [x] geocodeFetch.ts/GeocodeGateway: 고정 provider descriptor·credential hash·요청/응답 제한·내부 바인딩·deadline·저장소 오류 차단 검증.
- [x] geocode.ts: 정확한 주소 대체 조회 및 geocodeFetch 연동, 주소 번호/지역 불일치·원본 실패 회귀.
- [x] AppBindings/index/wrangler: SQLite class migration 및 요청 context로 REST/MCP 모두 적용, 바인딩 없는 CLI 유지.
- [x] docs/geocoding-resilience.md: 무료 공급자 비교, 현재 fallback, 공공 주소 DB 데이터/신청/좌표계/갱신 계획 기록.
- [ ] check/build/coverage100, 독립 리뷰, PR 검증·병합·배포, 인증 fresh 운영 조회 후 PROJECT.md 기록.
