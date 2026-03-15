# GS25 Android 우회 실측 가이드 (mitm + Frida)

작성일: 2026-03-08 (KST)
대상 앱: 우리동네GS Android (`com.gsr.gs25`)

## 1. 목적

- GS25 앱의 핀닝/네이티브 네트워크 우회 후 재고 API를 실측
- `b2c-apigw.woodongs.com`/`b2c-bff.woodongs.com` 호출 여부 확인

## 2. 준비물

- Android 실기기 또는 에뮬레이터 (root 권장)
- Frida (`frida-tools`) + frida-server (기기 아키텍처 일치)
- mitmproxy/mitmdump
- Burp용이 아니라 mitm CA를 Android 시스템 신뢰에 반영할 수 있는 환경

## 3. 전체 전략

1. `MITM 정상 여부`를 먼저 확인 (일반 HTTPS 앱 캡처)
2. GS25 앱 실행 시 Frida로 SSL pinning 우회 스크립트 주입
3. 재고 시나리오를 재현하면서 mitm 캡처
4. `requests/connects/errors`에서 `b2c-*` 또는 재고 키워드 확인

## 4. 기기 설정

### A. 프록시

- Android Wi-Fi 프록시를 Mac IP:`8080`으로 설정

### B. CA 신뢰

- 사용자 인증서 설치만으로 실패하면 시스템 CA로 이동 필요
- root 가능 기기:
  - `/system/etc/security/cacerts/`에 mitm CA 해시 파일 배치
  - 권한/SELinux 컨텍스트 맞춤 후 재부팅

## 5. Frida 기본 연결 확인

```bash
frida-ps -U
adb shell pidof com.gsr.gs25
```

- 장치 인식 안 되면 `adb devices`, USB 디버깅, frida-server 실행 상태 점검

## 6. 우회 실행 순서

### Step 1. mitm 캡처 시작

```bash
mkdir -p captures/gs25-android-r1
mitmdump \
  --listen-host 0.0.0.0 \
  --listen-port 8080 \
  -s scripts/mitmproxy/gs25_capture_export.py \
  --set gs25_capture_dir=captures/gs25-android-r1 \
  --set gs25_capture_scenario='Android+Frida 재고조회 실측' \
  --set gs25_capture_hosts='*' \
  -w captures/gs25-android-r1/raw.mitm
```

### Step 2. GS25 앱 핀닝 우회 주입

```bash
frida -U -f com.gsr.gs25 -l scripts/frida/android-ssl-bypass.ts
```

참고:

- 스크립트가 없다면 일반적인 우회 포인트를 포함한 템플릿을 먼저 작성
- 최소 대상:
  - `javax.net.ssl.*`
  - `okhttp3.CertificatePinner`
  - `TrustManagerImpl` 계열

부트스트랩/헤더 경계 관찰용 보조 스크립트:

```bash
frida -U -f com.gsr.gs25 -l scripts/frida/gs25-b2c-bootstrap-probe.ts
```

- 목적:
  - `appKey`, `xTenantId`, `Authorization`, `deviceId`가
    Java/Flutter 경계에서 언제 준비되는지 관찰
  - `MethodChannel`, `SharedPreferences`, `Cronet/OkHttp` 헤더만 선별 로깅
- 메모:
  - Dart 내부 `ApiResponseEncrypter`를 직접 후킹하는 스크립트는 아님
  - anti-Frida 환경에서 상대적으로 가벼운 보조 관찰용으로 사용

WebView 리플레이 JSON 추출 스크립트:

```bash
frida -U -f com.gsr.gs25 -l scripts/frida/gs25-webview-replay-extract.ts
```

- 출력 포맷:
  - `[GS25_REPLAY] {"t":"markers|marker_click|center|level|touchable","ts":...,"payload":{...}}`
- 용도:
  - `setAllStoreMarker`, `onMarkerClick`, `setCenter`, `setLevel`, `setTouchable`를
    구조화 JSON으로 추출해 리플레이 파라미터 생성에 바로 사용

JSONL 자동 저장 러너:

```bash
scripts/gs25-webview-replay-capture.sh
```

- 산출물:
  - `captures/gs25-replay-<timestamp>/frida-replay-raw.log`
  - `captures/gs25-replay-<timestamp>/gs25-replay-events.jsonl`

리플레이 파라미터 변환:

```bash
npx tsx scripts/gs25-replay-events-to-params.ts \
  captures/gs25-replay-<timestamp>/gs25-replay-events.jsonl
```

- 출력:
  - `captures/gs25-replay-<timestamp>/gs25-replay-events.params.json`

### Step 3. 앱 시나리오 재현

- 앱 실행
- 로그인/세션 확인
- 상품 검색
- 재고조회 진입
- 매장 선택 후 수량 노출 화면까지 이동

### Step 4. 종료

- mitmdump `Ctrl+C`
- Frida 세션 종료

## 7. 분석 명령

```bash
# 기본 건수
cat captures/gs25-android-r1/summary.json
wc -l captures/gs25-android-r1/requests.jsonl \
      captures/gs25-android-r1/connects.jsonl \
      captures/gs25-android-r1/errors.jsonl

# 후보 도메인 확인
rg -n 'b2c-apigw|b2c-bff|woodongs|gsshop|gsretail' captures/gs25-android-r1/requests.jsonl

# 재고 후보 키워드
rg -n 'stock|inventory|goods|product|store|barcode|qty|재고' captures/gs25-android-r1/requests.jsonl

# CONNECT만 보이고 requests에 없을 때
jq -r '.request.host + \"\\t\" + .request.method + \"\\t\" + .request.path' \
  captures/gs25-android-r1/connects.jsonl | sort | uniq -c | sort -nr | head -n 80
```

## 8. 성공 기준

- `requests.jsonl`에서 `b2c-apigw.woodongs.com` 또는 `b2c-bff.woodongs.com` 확인
- 재고/매장/상품 식별 필드 최소 1세트 확보
  - 예: 상품코드, 매장코드, 재고수량
- 동일 요청 재현(curl/스크립트) 가능성 확인

## 9. 실패 시 체크리스트

1. `connects`만 많고 `requests`가 적음

- 핀닝 우회 미적용 가능성
- 앱 프로세스 재시작 타이밍에 Frida attach 누락

2. `app_error/login` 반복

- 앱 세션/로그인 불안정
- 프록시 또는 SSL 우회 적용 순서 문제

3. `msg-api`만 보임

- 네이티브 채널 암호화 또는 별도 전송 레이어 가능성
- 우회 포인트 확대 필요 (Cronet/Native SSL 라이브러리 포함)

## 10. 산출물 기록 규칙

- 분석 결과는 아래 문서에 누적:
  - `docs/gs25-network-analysis-result.md`
- 실행 로그/실패 원인은 아래에 누적:
  - `docs/gs25-app-capture-attempt-log-20260308.md`
