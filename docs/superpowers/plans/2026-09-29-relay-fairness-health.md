# Relay Fairness and Health Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated rate-control implementation and independent reviews.

**Goal:** OY 공용예산 독점을 방지하고 헬스체크 재검사와 외부403 분류를 바로잡는다.
**Architecture:** request-scoped anonymous consumer→relay admission→bounded cooldown; typed upstream diagnostics→health classifier→strict workflow runner.
**Tech Stack:** Node24, TypeScript, Cloudflare Workers ALS, Hono, Vitest, GitHub Actions.

- [ ] Rate-control task: 소비자identity 및 HMAC headers, relay bounded admission12/min+2inflight, 캐시bypass, retryAfter metadata/publicpropagation/cooldown scope를 tests먼저구현. 소비자격리·spoof·UTCreset·queue해제·boundedmaps·취소·신선캐시우선·RetryAfter감소·globalvsconsumer 범위 검증. Owner agent.
- [ ] Health task: CgvUpstreamUnavailableError의원본status를 API diagnostics로보존. 건강검사 typed403분류와 CLI경로scope. 401/timeouts/unrelatederrors실패테스트. Owner root.
- [ ] Workflow task: scripts/ops health-summary validator/runner 및workflow. curl실패/잘못된JSON/0checks/fail/degraded/forcedfreshretry/timeout/아티팩트테스트. Owner root.
- [ ] 전체검증·스펙/품질검토 후버전갱신 및PR. mainCI성공후Worker/Mac배포,public/MCP조회,수동Health Checks실행결과확인. 로그/디스크상한유지·운영기록.
