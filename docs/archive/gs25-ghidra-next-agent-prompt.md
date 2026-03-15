# GS25 Ghidra 병행 분석 프롬프트

아래 내용을 다음 에이전트에 그대로 전달하세요.

---

프로젝트: `/Users/hm/Documents/GitHub/daiso-mcp`

목표:

- GS25 앱의 `재고 API 직렬화/응답 복호화` 단서를 Ghidra + 런타임 후킹으로 연결
- WebView replay 이벤트(`markers/marker_click/center/level/touchable`)와
  정적 모델명/인터셉터명을 매핑

먼저 읽을 문서:

- `docs/gs25-network-analysis-result.md`
- `docs/gs25-app-capture-attempt-log-20260308.md`
- `docs/gs25-next-agent-prompt.md`

현재 확인된 바이너리:

- `tmp/gs25-apk/base.apk`
- `tmp/gs25-apk/split_config.arm64_v8a.apk`
- `tmp/gs25-apk/lib/libapp.so`
- `tmp/gs25-apk/lib/libnms.so`

핵심 단서(이미 확인됨):

- `libapp.so` 문자열:
  - `retrieve_gs25_reservation_real_stock_request.dart`
  - `Gs25ReservationRealStockData`
  - `ApiResponseEncryptionConverter`
  - `responseInterceptorWrapper`
  - `B2C_API_URL`
  - `B2C_REFRIGERATOR_API_URL`
  - `/catalog/v1/gs25/reservation/items`
  - `/refrigerator/v1/wine25/stock/infm/`
- `libnms.so`:
  - `JNI_OnLoad` 디컴파일 가능
  - XOR decode 성격 함수(`FUN_00115134`) 확인

이번 세션의 필수 작업:

1. Ghidra 도구로 `libnms.so` 추가 디컴파일
   - `JNI_OnLoad` 호출 체인에서 `RegisterNatives`/검증 루틴 후보 식별
   - 후보 함수 5개 이상 디컴파일 후 역할 요약

2. `libapp.so` 단서를 런타임 후킹 포인트로 변환
   - 문자열 단서 기준으로 Frida 로그 포인트 후보 정의
   - 최소 후보:
     - `ApiResponseEncryptionConverter`
     - `responseInterceptorWrapper`
     - `buildB2cRefrigeratorApiServerAddressSetting`

3. replay 이벤트 재수집
   - `scripts/gs25-webview-replay-capture.sh --host 127.0.0.1:27042`
   - 앱에서 재고찾기 시나리오 1회 수행
   - `npx tsx scripts/gs25-replay-events-to-params.ts <events.jsonl>`

산출물:

- `captures/.../gs25-replay-events.jsonl`
- `captures/.../gs25-replay-events.params.json`
- 문서 업데이트:
  - `docs/gs25-network-analysis-result.md`
  - `docs/gs25-app-capture-attempt-log-20260308.md`

검증 기준:

- JSONL 이벤트 5종 존재:
  - `markers`, `marker_click`, `center`, `level`, `touchable`
- params JSON 필드 존재:
  - `latestState.selectedStore`
  - `latestState.center`
  - `latestState.level`
  - `latestState.stores`
- Ghidra 결과에 `JNI_OnLoad` 체인 함수 5개 이상 역할 요약 포함

---
