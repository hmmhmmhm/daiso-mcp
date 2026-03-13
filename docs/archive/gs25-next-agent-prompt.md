# GS25 다음 에이전트 실행 프롬프트

아래 내용을 다음 에이전트에 그대로 전달하세요.

---

당신의 목표는 GS25 재고찾기 분석을 **암복호화 후킹 전 단계까지 안정 자동화**하는 것입니다.

## 컨텍스트

- 프로젝트 루트: `/Users/hm/Documents/GitHub/daiso-mcp`
- 앱: `com.gsr.gs25`
- 현재 완료 상태:
  - WebView 주입 함수 파싱 가능
  - `scripts/frida/gs25-webview-replay-extract.js`로 `[GS25_REPLAY]` JSON 이벤트 출력 가능
  - `scripts/gs25-webview-replay-capture.sh`로 JSONL 저장 가능
  - `scripts/gs25-replay-events-to-params.mjs`로 params JSON 변환 가능
- MCP 설정:
  - `.mcp.json`에 `frida` 서버(`command: frida-mcp`) 추가됨

## 먼저 할 일 (필수)

1. `frida-mcp` 실행 가능 여부 확인

- `command -v frida-mcp || python3 -m pip show frida-mcp`
- 없으면 설치:
  - `python3 -m pip install frida-mcp`

2. 디바이스/Frida 연결 확인

- `adb devices -l`
- `adb shell ps -A | rg com.gsr.gs25`
- `adb forward tcp:27042 tcp:27042`
- `frida-ps -H 127.0.0.1:27042 -ai | rg -i 'com\\.gsr\\.gs25|우리동네GS'`

3. 자동 캡처 1회 실행

- `scripts/gs25-webview-replay-capture.sh --host 127.0.0.1:27042`
- 실행 중 앱에서:
  - 재고찾기 진입
  - 상품 상세 지도 진입
  - 목록보기 -> 매장 선택 -> 지도보기

4. 변환 실행

- `node scripts/gs25-replay-events-to-params.mjs <events.jsonl 경로>`

## 이번 턴의 산출물 목표

- `captures/.../gs25-replay-events.jsonl`
- `captures/.../gs25-replay-events.params.json`
- 문서 업데이트:
  - `docs/gs25-app-capture-attempt-log-20260308.md`
  - `docs/gs25-network-analysis-result.md`

## 검증 기준

- JSONL에 이벤트 5종 존재:
  - `markers`, `marker_click`, `center`, `level`, `touchable`
- params JSON에 다음 필드 존재:
  - `latestState.selectedStore`
  - `latestState.center`
  - `latestState.level`
  - `latestState.stores`

## 다음 우선순위 (가능하면 진행)

- `storeCode -> 매장명/주소` 자동 매핑 수집 (UI content-desc + marker_click 상관관계)
- 암복호화 후킹 후보(`ApiResponseEncrypter`, interceptor wrapper)와 이벤트 타임라인 결합

---
