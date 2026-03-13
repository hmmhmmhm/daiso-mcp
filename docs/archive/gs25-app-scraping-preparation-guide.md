# GS25 앱 스크래핑 준비 가이드 (mitmproxy 기반)

작성일: 2026-03-08 (KST)  
대상: iOS/Android 우리동네GS 앱

## 1. 목적

이 문서는 우리동네GS 앱 트래픽을 실측해, 재고조회/매장 조회 관련
스크래핑 가능 데이터를 식별하기 위한 준비 절차를 제공합니다.

핵심 산출물:

- `raw.mitm`: 원본 mitmproxy 플로우 파일
- `requests.jsonl`: 민감정보 마스킹된 요청/응답 레코드
- `summary.json`: 시나리오/건수 요약

## 2. 선행 문서

- 기본 MITM 세팅: `docs/mitmproxy-guide.md`
- GS25 웹 선행 분석: `docs/gs25-network-analysis-result.md`
- 캡처 전달 포맷 참고: `docs/cu-app-request-capture-guide.md`
- GS25 시도 로그: `docs/gs25-app-capture-attempt-log-20260308.md`
- Android 우회 실측: `docs/gs25-android-bypass-capture-guide.md`

## 3. 사전 준비

1. Mac/모바일 동일 Wi-Fi 연결
2. iOS 프록시 수동 설정 및 mitm 인증서 신뢰 완료
3. `mitmproxy` 설치 확인
4. 우리동네GS 앱 최신 버전 설치 및 로그인 상태 준비
5. 캡처 시나리오 사전 정의

권장 시나리오:

- 앱 실행
- 점포/지역 설정
- 상품 검색
- 재고조회 화면 진입
- 상품 상세에서 매장별 재고/수량 확인

## 4. 수집 명령

프로젝트 루트에서 아래를 실행합니다.

```bash
mkdir -p captures/gs25-20260308
mitmdump \
  --listen-host 0.0.0.0 \
  --listen-port 8080 \
  -s scripts/mitmproxy/gs25_capture_export.py \
  --set gs25_capture_dir=captures/gs25-20260308 \
  --set gs25_capture_scenario='앱 로그인 후 상품 검색, 재고조회, 매장 상세 확인' \
  --set gs25_capture_hosts='gsretail.com,gs25.com,thepopplus.co.kr' \
  -w captures/gs25-20260308/raw.mitm
```

수집 종료는 `Ctrl+C`로 합니다.

참고:

- 초기에 호스트 필터를 좁게 시작하고 누락 시 확대합니다.
- 필요 시 `--set gs25_capture_hosts='gsretail.com,gs25.com,thepopplus.co.kr,airbridge.io,hackle.io'`로 확장해 재수집합니다.

## 5. 생성 파일 설명

### A. requests.jsonl

- 한 줄당 1개 요청/응답 레코드(JSON)
- 포함 정보:
  - 요청: method, host, path, query, headers, body preview
  - 응답: statusCode, headers, body preview
- 기본 마스킹:
  - 헤더: `Authorization`, `Cookie`, `Set-Cookie`, 토큰 계열
  - 쿼리: `token`, `password`, `session`, `jwt` 계열

### B. summary.json

- 시나리오명
- 대상 호스트 목록
- 전체/매칭/스킵 건수
- 산출물 경로

### C. raw.mitm

- 원본 플로우 파일
- 필요 시 `mitmweb -r captures/gs25-20260308/raw.mitm`로 재열람

## 6. 1차 분석 명령

```bash
# 총 캡처 건수
wc -l captures/gs25-20260308/requests.jsonl

# 호스트 분포
jq -r '.request.host' captures/gs25-20260308/requests.jsonl | sort | uniq -c | sort -nr

# 경로 분포 상위
jq -r '.request.path' captures/gs25-20260308/requests.jsonl | sort | uniq -c | sort -nr | head -40

# 재고/매장/상품 관련 후보
rg -n 'stock|inventory|goods|product|store|shop|pickup|재고|매장|상품' captures/gs25-20260308/requests.jsonl

# 상태코드 분포
jq -r '.response.statusCode // "NA"' captures/gs25-20260308/requests.jsonl | sort | uniq -c
```

## 7. 스크래핑 가능 데이터 판정 기준

### A. 즉시 구현 가능

- 비인증 또는 약한 인증으로 재현 가능한 재고/매장 API 식별
- 최소 헤더/파라미터가 명확함
- 응답에 상품코드/매장코드/수량 필드가 안정적으로 존재

### B. 조건부 구현 가능

- 세션/토큰 필요하지만 재현 가능
- 토큰 갱신 또는 선행 호출 체인이 필요

### C. 보류

- certificate pinning 또는 강한 기기결합으로 복호화/재현이 어려움
- 응답 암호화/서명으로 의미 필드 해석이 불가

## 8. 실패 시 점검

1. HTTPS 요청이 거의 안 보임

- iOS 인증서 신뢰 설정 재확인
- 프록시 IP/포트 오타 확인

2. 앱 핵심 요청이 누락됨

- 앱 certificate pinning 가능성 점검
- Android 동일 시나리오 비교 캡처

3. 요청은 보이지만 재고 필드가 없음

- 재고 확정 직전 단계(매장 선택 후 재고 결과 화면)까지 시나리오 확대

## 9. 후속 문서화 규칙

실측 후 아래 순서로 문서를 업데이트합니다.

1. `docs/gs25-network-analysis-result.md`에 앱 실측 섹션 추가
2. 재현 가능한 엔드포인트를 `curl` 예시와 함께 기록
3. 구현 판정을 A/B/C로 업데이트
4. 필요 시 `docs/gs25-app-scraping-replay-guide.md` 신규 작성
