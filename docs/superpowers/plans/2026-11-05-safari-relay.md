# Safari 중계 구현 계획

승인 설계: DESIGN.md. 사용자 지정대로 모든 작업은 순차 실행한다.

- [ ] 1. 현재 프로세스·잠금·메모리·CI 비중첩 확인. Chrome 작업 페이지가 있으면 소유 OY LaunchAgent를 정상 중지하고 회수 확인. Tunnel/인증/원장은 보존.
- [ ] 2. 고정 창 ID Safari 스킬로 robots.txt 원점 준비 후 허용된 상품 API fetch를 시작하고 난수 키 결과를 polling. 실패 상태와 최소화 상태, 페이지 정리 기록. 실패하면 구현·운영 전환을 중단하고 원인 기록.
- [ ] 3. 성공 시 격리 worktree에서 scripts/relay/safari-lifecycle.ts와 제한된 Python helper 추가. tests/relay/safari-lifecycle.test.ts에서 잠금 충돌·시간 초과·출력 제한·종료·정리 실패를 먼저 실패 확인 후 구현. transport-lifecycle.ts에 명시적 safari 모드만 추가.
- [ ] 4. npm test 대상 검사, lint/typecheck 및 npm run test:coverage를 자원 보호 실행기로 순차 수행. 검증 중 fresh 원본 요청 금지.
- [ ] 5. 검증된 파일을 운영 runtime에 반영하고 환경의 전송 모드만 safari로 변경. Chrome 자동 시작·숨김 도우미 중단, 인증/원장 보존. 실패 시 기존 모드 복구.
- [ ] 6. 실제 상품·매장·재고·오특과 캐시 우회 운영·CLI/MCP를 순차 검증. 문서·AGENTS·PROJECT와 운영 결과 기록. 외부 게시 초안 승인 전 게시하지 않음.
