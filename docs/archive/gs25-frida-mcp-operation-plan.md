# GS25 Frida MCP 운영 설계

작성일: 2026-03-11 (KST)
대상 앱: `com.gsr.gs25`

## 1. 목표

- GS25 재고찾기 플로우에서 다음 2개를 안정적으로 수집
  - 매장/재고 목록 (`storeCode`, `balloonText`, 좌표, enable)
  - 선택 상태 (`onMarkerClick`, `center`, `level`, `touchable`)
- 수집물을 JSONL/파라미터 JSON으로 자동화해 다음 라운드(암복호화 후킹) 입력으로 사용

## 2. 현재까지 확보된 사실

- WebView 경계에서 `setAllStoreMarker`, `onMarkerClick`, `setCenter`, `setLevel`, `setTouchable` 포착 가능
- JS -> 앱 콜백(`onDragStart`, `onDragEndOrZoomChangedAndAnimated`, `callAsyncJavaScript`) 포착 가능
- 앱은 anti-hooking 민감 구간이 있어 무거운 후킹 시 크래시 가능

## 3. Frida MCP 도입 의도

- Frida attach/재시작/로그 수집을 에이전트 워크플로로 표준화
- 반복 작업(스크립트 교체, 같은 UI 동선 재현, 결과 파일화) 비용 감소
- 실패 케이스(크래시/무로그)를 라운드 단위로 재현 가능하게 관리

주의:
- Frida MCP는 anti-Frida를 자동 우회하지 않음
- 네트워크 평문 복호화를 자동 제공하지 않음

## 4. 운용 파이프라인

1. 앱 상태 확인
- `adb shell ps -A | rg com.gsr.gs25`
- PID 확보

2. 경량 추출 attach
- `scripts/frida/gs25-webview-replay-extract.js` 우선 적용
- 결과를 `[GS25_REPLAY]` JSON 이벤트로 수집

3. 파일 저장
- `scripts/gs25-webview-replay-capture.sh` 사용
- 산출물:
  - `frida-replay-raw.log`
  - `gs25-replay-events.jsonl`

4. 파라미터 변환
- `node scripts/gs25-replay-events-to-params.mjs <events.jsonl>`
- 산출물:
  - `*.params.json` (`latestState`, `replaySequence`)

5. 다음 단계 입력
- `storeCode/serviceCode/lat/lng/level`을 암복호화 후킹 타깃 추적 기준으로 사용
- 동일 시점 `request_e`/`response_e`와 상관관계 분석

## 5. 크래시 최소화 규칙

- 1회에 후킹 스크립트 1~2개만 attach
- `WebViewChannelDelegate`/내부 delegate 직접 후킹은 별도 라운드로 격리
- 크래시 발생 시:
  - 앱 재실행 -> 경량 스크립트만 붙여 기준 상태 복원
  - 실패 라운드 로그를 문서에 즉시 기록

## 6. .mcp.json 설정

프로젝트 루트 `.mcp.json`에 다음 서버를 등록:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"]
    },
    "frida": {
      "command": "frida-mcp"
    }
  }
}
```

## 7. 선행 조건

- `frida-mcp` 설치 필요
  - 예: `pip install frida-mcp`
- 로컬 Frida 연결 가능 상태 필요
  - 예: `adb forward tcp:27042 tcp:27042`
  - `frida-ps -H 127.0.0.1:27042`

## 8. 성공 기준

- `gs25-replay-events.jsonl`에 아래 이벤트가 한 세션에 모두 존재
  - `markers`
  - `marker_click`
  - `center`
  - `level`
  - `touchable`
- `*.params.json`에서
  - `latestState.selectedStore`
  - `latestState.center`
  - `latestState.level`
  - `latestState.stores[]`
  가 채워짐

## 9. 참고

- frida-mcp PyPI: https://pypi.org/project/frida-mcp/
- frida-mcp GitHub: https://github.com/dnakov/frida-mcp
