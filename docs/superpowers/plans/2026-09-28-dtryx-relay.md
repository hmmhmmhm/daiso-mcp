# 디트릭스 전용 HTTPS 중계 구현 계획

## 승인된 목표와 설계
사용자가 Mac 출발 고정 API 중계를 승인했다. Cloudflare 원본 연결 실패를 피하기 위해 디트릭스만 별도 브라우저 없는 프로세스127.0.0.1:4320으로 중계한다. 기존 Tunnel/Access를 공유하며 토큰·프로세스·큐·파일 사용량 원장은 분리한다. 직접 CLI는 설정이 없으면 기존 원본 조회를 유지하고 Worker REST/MCP는 명시적 DTRYX 설정을 주입한다. 운영 변경 전 회귀·보안·수명주기 검증을 완료한다.

## 경로 계약
- POST /v1/dtryx/timetable: {brandCode, cinemaCode, playDate(YYYYMMDD)}
- POST /v1/dtryx/play-dates 및 /v1/dtryx/movies: {brandCode, cinemaCode}
- GET /v1/dtryx/health: 인증 상태 확인
- 성공 응답은 기존 원본 RetCode/Recordset 그대로. 임의URL/헤더/추가필드/리다이렉트 불허.
- brandCode는 영문소문자로 시작하는 영문소문자/숫자/_/- 최대32자, cinemaCode는6자리 숫자, 날짜는 유효한 YYYYMMDD.
- 인증 Bearer 비교, 본문16KiB/응답2MiB/전체15초, 동시4·대기포함32개, 원장30회/분·3000회/UTC일. 취소·실패 뒤 슬롯 회수.
- DTRYX_RELAY_URL/TOKEN 및 DTRYX_ACCESS_CLIENT_ID/SECRET. 운영URL은 기존oy-relay.aka.page, 별도 Bearer토큰과 기존 Access서비스 자격증명 사용.

## 실행 순서
- [x] TDD로 Mac 핸들러/고정HTTPS 호출·상한·취소·별도 시작점 구현.
- [x] TDD로 client/options·REST·MCP·설정진단·시크릿동기화 연결. 원본 경로와 오류 의미 보존.
- [x] 독립 검토, 전체check/coverage100/build/audit/pack.
- [x] Mac LaunchAgent 설치·실제조회·인증거부·재시작 검증 후 Tunnel경로 추가.
- [ ] Worker/GitHub 시크릿 설정, PR CI/병합/배포/npm 릴리스.
- [ ] 운영 REST/MCP 반복 조회, OY 회귀·브라우저수 불변 확인. 결과와 한계 기록.

## 운영 경계
Zyte 미사용. OY브라우저코드/큐 변경 없음. 디트릭스 source3개 공개GET API만 호출. max-old-space-size128MiB, 요청/응답 상한, 외부신호종료시 HTTP연결 정리. 사용량원장은 재시작에도 유지하며 오류시failclosed. 원본 네트워크 문제 자체가 해결됐다고 주장하지 않는다.
