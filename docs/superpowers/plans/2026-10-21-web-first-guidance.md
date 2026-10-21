# 무설치 경로 안내 구현 계획

**Goal:** 웹 도구가 있는 Chat 에이전트가 셸 DNS 실패에 멈추지 않고 HTML GET으로 첫 조회를 완료하도록 안내를 일치시킨다.
**Architecture:** 기존 agentStart 공통 문구를 첫 화면과 prompt에서 재사용한다. README와 문서는 동일한 순서를 명시한다. 서버 조회 계약은 유지한다.
**Tech Stack:** TypeScript, Markdown, Vitest, Cloudflare Workers.

- [x] agentStart/discovery/prompt/README/AI 문서의 경로 우선순위와 이미지 출처·실행 근거 검사를 추가하고 기존 문구에서 실패함을 확인한다.
- [x] 공통 시작 안내, 첫 화면, 문서의 구형 예제 및 이미지 출처 지침을 수정한다. 상세 구형 레퍼런스는 deprecated임을 명시한다.
- [ ] check, coverage 100%, build, 정적 발견 자산 생성, 독립 리뷰와 GitHub 검사를 수행한다.
- [ ] PR 병합·배포 후 첫 화면/llms/prompt/HTML 실제 검색·후속 조회·MCP 10개 유지를 확인하고 운영 기록을 남긴다.
