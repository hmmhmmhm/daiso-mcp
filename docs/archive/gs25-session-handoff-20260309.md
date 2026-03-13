# GS25 세션 인계 메모 (2026-03-09)

## 1) 현재 결론

- `b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com`는 앱에서 실제 접속됨
  - 근거: `captures/gs25-android-20260309-r7,r9,r10,r11,r12,r13`의 `pcap TLS SNI`
- 다만 `mitmdump requests.jsonl` 평문 계층에서는 `b2c-*` 요청/응답이 계속 미확보
- 평문 관측은 주로:
  - `POST tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}`
  - `GET m.woodongs.com/app_error/login` 및 정적 파일

## 2) 누적 시도 요약

- `r1~r6`: Android + Frida 우회/후킹 기본 실측
- `r7`: `tcpdump` 병행으로 `b2c-*` SNI 최초 확인
- `r8`: TLS keylog 콜백 시도(성과 없음)
- `r9~r13`: Java/Cronet/객체덤프/콜스택/Cronet probe 확장
  - 실접속 증거는 강화됨
  - 평문 API 스키마는 미확보

## 3) 주요 파일

- 문서:
  - `docs/gs25-network-analysis-result.md`
  - `docs/gs25-app-capture-attempt-log-20260308.md`
  - `docs/gs25-android-bypass-capture-guide.md`
  - `docs/gs25-app-scraping-preparation-guide.md`
- 스크립트:
  - `scripts/mitmproxy/gs25_capture_addons.py`
  - `scripts/frida/gs25-msgapi-target-hook.js`
  - `scripts/frida/gs25-b2c-java-net-hook.js`
  - `scripts/frida/gs25-b2c-focused-dump.js`
  - `scripts/frida/gs25-b2c-stacktrace-dump.js`
  - `scripts/frida/gs25-b2c-cronet-probe.js`

## 4) 다음 세션 목표

1. `r14` 캡처 시작 (`mitmdump + frida + tcpdump` 동시)
2. 사용자 재현 1회 직후 즉시 분석
3. `b2c-*` 평문 API 후보 확보 시도
4. 실패 시 계층별 실패 원인 명시(MITM/Java/Native/TLS)
5. 결과를 `docs/gs25-network-analysis-result.md`에 `22)` 섹션으로 추가

## 5) 다음 세션 입력 프롬프트 (복붙용)

```text
프로젝트: /Users/hm/Documents/GitHub/daiso-mcp

먼저 아래 문서들을 읽고 현재 상태를 이어서 진행해줘:
- docs/gs25-network-analysis-result.md
- docs/gs25-session-handoff-20260309.md
- docs/gs25-app-capture-attempt-log-20260308.md
- docs/gs25-android-bypass-capture-guide.md
- docs/gs25-app-scraping-preparation-guide.md

현재 상태 요약:
- b2c-apigw.woodongs.com / b2c-bff.woodongs.com 실접속은 pcap TLS SNI로 반복 확인됨(r7,r9~r13)
- 하지만 MITM 평문 requests.jsonl에서는 b2c 요청/응답(JSON 스키마) 미확보
- 평문으로는 tms31.gsshop.com/msg-api/* + m.woodongs.com/app_error/login 위주

이번 세션 목표:
1) r14 캡처 세션 시작 (mitmdump + frida + tcpdump 동시)
2) 내가 GS25 앱에서 재고 시나리오 1회 재현하면 즉시 분석
3) b2c-apigw/b2c-bff의 평문 API 후보(경로/메서드/파라미터) 확보 시도
4) 확보 실패 시에도 "왜 실패했는지"를 계층별(MITM/Java/Native/TLS)로 명확히 기록
5) 결과를 docs/gs25-network-analysis-result.md에 22) 섹션으로 업데이트

진행 방식:
- 내가 "재현 완료"라고 말하면 바로 해당 라운드 산출물 기준으로 요약/판정 업데이트
- 명령 실행 전에 현재 실행할 캡처 스택을 한 줄로 공지
- 최종 답변에는 다음 액션 3가지를 우선순위로 제시
```
