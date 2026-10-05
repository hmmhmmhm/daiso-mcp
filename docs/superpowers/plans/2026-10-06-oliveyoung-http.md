# 올리브영 HTTP 중계 구현 계획

**Goal:** 기존 맥 중계에서 브라우저 없이 네 API 조회.
**Architecture:** 고정 Python urllib helper와 Node lifecycle을 추가하고 start의 명시적인 http/browser 선택만 변경.
**Tech Stack:** Node execFile, Python3 stdlib, Vitest, unittest.

- [ ] tests/relay/http-lifecycle.test.ts tests/relay/transport-lifecycle.test.ts tests/relay/oliveyoung-http-python.test.ts와 Python helper 오프라인 fixture 테스트에서 성공·403·redirect·size·malformed·timeout·invalid path·close를 먼저 실패시킨다. 실행: npx vitest run tests/relay/http-lifecycle.test.ts tests/relay/transport-lifecycle.test.ts tests/relay/oliveyoung-http-python.test.ts; python3 tests/relay/test_oliveyoung_http.py.
- [ ] scripts/relay/oliveyoung-http.py에 고정 경로/헤더/200 SUCCESS 검증 및2MiB/15초 제한을 구현한다.
- [ ] scripts/relay/http-lifecycle.ts에 execFile18초 제한, 비밀 없는 환경, ready/active/closed health를 구현하고 위 테스트를 통과시킨다.
- [ ] scripts/relay/transport-lifecycle.ts에 모드선택을 추가하고 start.ts를 연결한다. http는 browser import/launch를 하지 않으며 기존 browser default 유지. 알 수 없는 모드 거부.
- [ ] vitest.config.ts coverage 대상에 새 TypeScript 모듈을 추가하고 npm run check; npm run test:coverage; npm run build; npm audit 실행. 새로운 측정 대상도100%.
- [ ] docs/oliveyoung-http-relay.md에 운영 설정·실측·실패/rollback 조건을 기록하고 독립 리뷰를 수행한다.
- [ ] PR 생성·CI확인·병합 후 원장과 인증을 보존하여 맥 runtime에 코드와 OY_RELAY_TRANSPORT/http 및 OY_HTTP_PYTHON을 반영. 사전 백업과 진행 요청0·소유 브라우저 종료 확인.
- [ ] 운영 REST/MCP/공개CLI 상품·매장·재고 일치 및 최종health/http/pages0을 검증하고 프로젝트 기록·완료 알림을 남긴다. Worker/CLI 코드 변화는 없어 새CLI 버전 발행은 필요하지 않다.
