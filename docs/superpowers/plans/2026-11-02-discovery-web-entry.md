# 자연어 발견 웹 입구 구현 계획

Goal: 기존 동작 경로의 문서 우선순위와 버전 불일치를 수정하고 최초 질문으로 재검증한다.
Architecture: README·discovery 첫 링크를 웹 조회로 통일. 기존 API/MCP/UUID/pending 계약 보존.

- [ ] tests/pages/discoveryEntry.test.ts: 공개 루트의 웹 조회 CTA가 복구/연결 안내보다 먼저 오고 README visible 첫 CTA도 동일 주소임을 검사. RED 확인.
- [ ] src/pages/discovery.ts·agentStart.ts와 README/현재 안내 기대값 수정. docs/web-discovery.md의 고정 옛 버전 제거.
- [ ] 회사 전달용 docs/chat-web-read-mcp-playbook.md 작성. 사실/가설/권고/공식 문서 구분, 평가/실패/접수/캐시/데이터/안전 경계 포함.
- [ ] 전체 필수 검사·리뷰 통과 후 병합·배포. 브라우저 실험과 전체 회귀를 겹치지 않음.
- [ ] 동일 자연어 질문 새 임시 대화2건. 각 응답의 공개 href와 수량을 대조하고 실패도 보존. PROJECT.md 결과 기록.
