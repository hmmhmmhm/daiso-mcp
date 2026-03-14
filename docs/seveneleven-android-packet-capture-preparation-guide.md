# 세븐일레븐 Android 패킷 캡처 준비 가이드 (mitm + Frida)

작성일: 2026-03-14 (KST)  
대상: 세븐일레븐 Android 앱 (패키지명 확인 필요)

## 1. 목적

이 문서는 Android 기기 기반으로 세븐일레븐 앱 트래픽을 실측하기 위한
"준비 -> 우회 -> 수집 -> 1차 분석" 절차를 제공합니다.

핵심 산출물:

- `raw.mitm`: 원본 mitmproxy 플로우 파일
- `requests.jsonl`: 민감정보 마스킹된 요청/응답 레코드
- `summary.json`: 시나리오/건수 요약
- `connects.jsonl`, `errors.jsonl`: TLS CONNECT/오류 추적 로그

## 2. 선행 문서

- 기본 MITM 세팅: `docs/mitmproxy-guide.md`
- GS25 Android 우회 실측 레퍼런스: `docs/archive/gs25-android-bypass-capture-guide.md`
- GS25 앱 준비 절차 레퍼런스: `docs/archive/gs25-app-scraping-preparation-guide.md`
- 캡처 전달 포맷 레퍼런스: `docs/cu-app-request-capture-guide.md`

## 3. 준비물

- Android 실기기 또는 에뮬레이터 (root 권장)
- `adb`, `frida-tools`, 기기 아키텍처에 맞는 `frida-server`
- `mitmproxy`/`mitmdump`
- Mac(호스트)와 Android 동일 Wi-Fi
- 세븐일레븐 앱 로그인 가능한 테스트 계정

## 4. 사전 확인

### A. 패키지명 확인

세븐일레븐 앱 패키지명은 기기에서 먼저 확인합니다.

```bash
adb shell pm list packages | rg -i 'seven|eleven|7|세븐'
```

확인된 값을 아래 문서에서는 `<SEVENELEVEN_PACKAGE>`로 사용합니다.

### B. 프록시 설정

- Android Wi-Fi 프록시를 Mac IP:`8080`으로 설정
- mitm CA 인증서 설치
- 사용자 인증서만으로 실패 시 시스템 CA 반영 필요(root 권장)

### C. Frida 연결 확인

```bash
frida-ps -U
adb shell pidof <SEVENELEVEN_PACKAGE>
```

## 5. 세븐일레븐 캡처 스크립트 준비

저장소에 세븐일레븐 전용 exporter가 준비되어 있습니다.

- `scripts/mitmproxy/seveneleven_capture_export.py`

옵션 키:

- `seveneleven_capture_dir`
- `seveneleven_capture_scenario`
- `seveneleven_capture_hosts`

기본 호스트(초기값):

- `7-eleven.co.kr`
- `lotte.co.kr`
- `lotteon.com`

주의: 실제 호출 도메인은 앱 버전/빌드에 따라 다를 수 있으므로 1차 수집은 `*` 권장

## 6. 실행 순서 (권장)

### Step 1. mitm 캡처 시작

```bash
mkdir -p captures/seveneleven-android-r1
mitmdump \
  --listen-host 0.0.0.0 \
  --listen-port 8080 \
  -s scripts/mitmproxy/seveneleven_capture_export.py \
  --set seveneleven_capture_dir=captures/seveneleven-android-r1 \
  --set seveneleven_capture_scenario='Android 로그인 후 상품 검색, 매장 선택, 재고조회' \
  --set seveneleven_capture_hosts='*' \
  -w captures/seveneleven-android-r1/raw.mitm
```

### Step 2. 앱 SSL pinning 우회 주입

기본 우회 스크립트(저장소에 존재):

```bash
frida -U -f <SEVENELEVEN_PACKAGE> -l scripts/frida/android-ssl-bypass.js
```

필요 시 2차 대응:

- Java 레벨 우회로 부족하면 native 레벨 후킹 스크립트 추가
- 앱 재시작 시점에 attach 누락되지 않게 `-f`로 spawn 후 주입

### Step 3. 시나리오 재현

- 앱 실행 및 로그인 상태 확인
- 주변 매장/점포 찾기 진입
- 상품 검색
- 상품 상세 또는 재고조회 화면 진입
- 매장 선택 후 수량/품절 여부 노출 화면까지 이동

### Step 4. 수집 종료

- mitmdump: `Ctrl+C`
- Frida 세션 종료

## 7. 1차 분석 명령

```bash
# 생성 파일 확인
ls -lah captures/seveneleven-android-r1

# 기본 건수
cat captures/seveneleven-android-r1/summary.json
wc -l captures/seveneleven-android-r1/requests.jsonl \
      captures/seveneleven-android-r1/connects.jsonl \
      captures/seveneleven-android-r1/errors.jsonl

# 호스트 분포
jq -r '.request.host' captures/seveneleven-android-r1/requests.jsonl | sort | uniq -c | sort -nr

# 재고/매장/상품 후보 키워드
rg -n 'stock|inventory|product|goods|item|store|shop|pickup|barcode|qty|재고|매장|상품' \
  captures/seveneleven-android-r1/requests.jsonl

# CONNECT만 보이는 경우 확인
jq -r '.request.host + "\t" + .request.method + "\t" + .request.path' \
  captures/seveneleven-android-r1/connects.jsonl | sort | uniq -c | sort -nr | head -n 80
```

## 8. 성공 기준

- `requests.jsonl`에서 세븐일레븐 핵심 API 도메인 1개 이상 식별
- 재고/매장/상품 식별 필드 최소 1세트 확보
  - 예: 상품코드, 매장코드, 재고수량/품절 여부
- 동일 요청을 `curl` 또는 스크립트로 재현 가능한지 확인

## 9. 실패 시 체크리스트

1. `connects`만 많고 `requests`가 거의 없음

- pinning 우회 미적용 가능성
- 시스템 CA 미반영 가능성
- Frida 주입 타이밍 누락 가능성

2. 요청은 보이는데 핵심 API가 없음

- 시나리오 부족 가능성(매장 선택/재고확정 직전 단계까지 진행 필요)
- 필터 호스트가 과도하게 좁아졌는지 확인

3. 응답이 암호화/난독화되어 의미 해석이 어려움

- Java 레벨 대신 native crypto 경계 후킹 검토
- 앱 업데이트 후 네트워크 레이어 변경 가능성 점검

## 10. 보안 및 기록 규칙

- 테스트 계정 사용, 실사용 개인정보 입력 금지
- `Authorization`, `Cookie`, 전화번호/주소 등 민감정보 마스킹 확인
- 산출물은 `captures/seveneleven-*` 패턴으로 날짜/회차 분리 저장

실측 후 문서화 권장:

1. `docs/seveneleven-network-analysis-result.md` 신규 작성
2. 재현 가능한 엔드포인트와 최소 헤더/파라미터 기록
3. 구현 가능성 A/B/C 판정 추가
4. 리플레이 절차는 `docs/seveneleven-app-scraping-replay-guide.md`에 누적

## 11. 안정 모드 리플레이 추출 (AppIron 대응)

세븐일레븐 앱은 Frida/후킹 탐지 시 앱이 종료될 수 있으므로,
다음 순서로 "최소 후킹 + attach" 방식으로 진행합니다.

### A. 원칙

- `frida -f`(spawn) 대신 앱 수동 실행 후 `-p` attach 사용
- SSL/Trust/Native 우회 스크립트 사용 금지
- WebView 관찰 전용 스크립트만 사용

### B. 사용 스크립트

- 최소 후킹 스크립트: `scripts/frida/seveneleven-webview-minimal-replay.js`
- 캡처 러너: `scripts/seveneleven-webview-replay-capture.sh`

### C. 실행

```bash
# 1) 앱을 먼저 수동 실행해서 홈 진입
# 2) frida-server 실행 및 포워딩
adb shell 'su -c "/data/local/tmp/frida-server >/dev/null 2>&1 &"'
adb forward tcp:27042 tcp:27042

# 3) attach 기반 이벤트 캡처
bash scripts/seveneleven-webview-replay-capture.sh
```

산출물:

- `captures/seveneleven-replay-<timestamp>/frida-replay-raw.log`
- `captures/seveneleven-replay-<timestamp>/seveneleven-replay-events.jsonl`

### D. 실패 시 대응

1. attach 직후 앱 종료

- 보안모듈(AppIron) 탐지 가능성
- 앱 완전 종료 후 재실행, 홈 진입 뒤 10~20초 후 attach 재시도

2. 이벤트가 비어 있음

- 해당 화면이 Native 렌더링일 수 있음
- 홈/검색/상품상세/매장지도 화면으로 범위를 바꿔 재수집
