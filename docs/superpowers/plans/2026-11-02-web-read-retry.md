# 웹 읽기 재시도 구현 계획

**Goal:** 실제 ChatGPT 웹에서 캐시 재시도 및 접수형 조회를 검증하고 복사 재전송 안내를 일치시킨다.

**Architecture:** 고정 가상 작업만 받는 실행번호별 Durable Object와 기존 실험 Worker를 사용한다. 운영 변경은 실험 이후 판단하며 JSON/MCP 계약을 보존한다.

- [ ] tests/scripts/web-read-lab-jobs.test.ts: 첫 지연·저장된 동일 결과·동시접수·pending/ready 링크·알람완료·24시간정리·외부실패 전파 회귀를 먼저 추가하고 resource guard를 통한 RED 확인.
- [ ] experiments/web-read-lab/jobs.ts 및 worker.ts/wrangler.toml: 고정 cold5/start5/result5 경로와 독립 DO 바인딩 구현. 가상시계 GREEN 후 기존 lab 회귀 및 CI/Coverage/리뷰 확인, 병합·실험 배포.
- [ ] BrowserSkill 소유 창1개/임시 채팅별 새 실행번호: delay5 대조 재시도, cold5 첫실패/동일URL재시도, start5 접수/실제결과링크를 직렬 비교. 캡처를 탐색 전에 시작하고 각 표본 후 UI와 서버 ID·시각을 저장한 뒤 탭 회수.
- [ ] README, src/pages/llms.ts 등 공통 발견 안내와 docs/client-guide.md, service-reference.md, web-reading-troubleshooting.md를 검색해 완성 URL 복사 재전송 문구와 실제 링크 우선 지침을 통일. 원본 이미지·freshness·공개도구10 계약 유지.
- [ ] 접수 실험이 성공하면 운영의 저장·권한·한도·원본 오류·작업수 제한 설계를 구체화한 뒤 회귀·리뷰·CI로 구현/배포. 성공을 확인하지 못하면 운영 확대 없이 제한과 후속 조건을 기록.
- [ ] PROJECT.md와 web-read-lab/2026-11-02에 결과·정확한 한계·배포 근거 저장, 세션 및 탭 정리, CI/배포 결과를 확인해 보고.
