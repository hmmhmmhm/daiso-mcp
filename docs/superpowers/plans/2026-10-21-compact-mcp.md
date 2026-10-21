# 공개 MCP 도구 10개 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 MCP 도구를 10개로 고정하고 구형 호출을 보존한다.
**Architecture:** 명시적 작업 매핑과 기존 Zod 입력/핸들러를 재사용하는 어댑터. SDK 등록은 모두 유지하고 목록 응답만 고정 공개 계약으로 제공한다.
**Tech Stack:** TypeScript, Zod, MCP SDK, Vitest.

### 1. 매핑과 스키마
- [x] tests/core/compact-tools.test.ts에서 매핑 44개 전체, 공개 이름10개, 잘못된 service/operation/인수의 실행전 거절, 모든 작업 dispatch와 구형 응답 보존 테스트를 먼저 작성한다.
- [x] `npx vitest run tests/core/compact-tools.test.ts`의 모듈 부재 실패를 확인한다.
- [x] src/core/compact/{catalog,tools,server}.ts를 만들고 각 책임을 매핑/어댑터/프로토콜 등록으로 분리한다. 기존 핸들러 호출 전 `z.object(tool.metadata.inputSchema).parse(args)`를 수행한다. 새 source가450줄을 넘지 않게 한다.
- [x] `npx vitest run tests/core/compact-tools.test.ts` 성공을 확인한다.

### 2. 프로토콜과 발견
- [x] tests/index.test.ts 및 SDK 통합 회귀에 tools/list 정확히10개, cursor/구형 별칭 호출/신형 호출/에러/세션 경로를 추가하고 실패를 확인한다.
- [x] src/index.ts의 createMcpServer와 buildRootInfo를 공개10개 계약에 연결한다. 공개 SDK setRequestHandler와 ListToolsRequestSchema를 사용하며 비공개 SDK 필드를 읽지 않는다.
- [x] scripts/ops/mcp-smoke.ts는 공개 목록10개/신형 호출/구형 호환 확인을 구분한다. 모든 스키마 변환이 성공하고 개발자 요청은 외부에 쓰지 않는지 검사한다.

### 3. 규칙과 문서
- [x] AGENTS.md 최상단과 ALIGNS.md에 공개 도구10개 상한을 사용자 최고 우선 요구로 기록한다. README/발견 페이지/llms 문서는 새 이름을 먼저 안내하고 별도 docs에 구형 전체 매핑과 deprecated 정책을 쓴다. REST/CLI 예시는 유지한다.
- [x] 기존 검사에서 공개44개 전제를 새 목록10개와 호환44개로 나눠 검증한다. 단순 기대값 삭제나 검사 약화를 하지 않는다.

### 4. 검증과 반영
- [x] `npm run check`, `npm run test:coverage`, `npm run build`를 실행해 전체 성공/네 지표100%를 확인한다. SDK 실제통신과 invalid 조합 회귀는 단순 모킹과 별도로 유지한다.
- [ ] 독립 리뷰 후 검증된 변경을 논리적으로 커밋/푸시하고 PR을 생성·첨부한다. GitHub CI/Coverage/CodeQL 통과 후 병합한다.
- [ ] 운영 / 및 /mcp tools/list10개, 새/구형 상품·매장·재고 호출과 CLI 유지 검증 후 PROJECT.md에 근거와 남은 문제를 쓴다. PlayMCP 콘솔 등록목록은 별도 갱신이 필요함을 구분한다.
