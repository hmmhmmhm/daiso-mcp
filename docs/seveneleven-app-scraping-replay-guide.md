# 세븐일레븐 앱 리플레이 가이드 (캐시 기반)

작성일: 2026-03-14 (KST)

## 1. 개요

세븐일레븐 앱은 AppIron 탐지로 인해 Frida attach 시 프로세스가 종료될 수 있습니다.
따라서 1차 리플레이는 앱 캐시/WebView 저장소에서 API URL을 추출해 진행합니다.

## 2. 추출 스크립트

```bash
bash scripts/seveneleven-cache-replay-extract.sh \
  --out captures/seveneleven-cache-replay-20260314-r2
```

## 3. 생성 파일

- `appdata.tar`: 앱 데이터 덤프
- `all-urls.txt`: 전체 URL 목록
- `seveneleven-urls.txt`: 세븐일레븐 관련 URL
- `api-urls.txt`: `new.7-elevenapp.co.kr/api/` URL만 필터
- `replay-curl-templates.sh`: 재호출용 템플릿

## 4. 현재 확인된 API 후보

- `https://new.7-elevenapp.co.kr/api/v1/common/common-code/APP003/`
- `https://new.7-elevenapp.co.kr/api/v1/common/common-code/list-all`
- `https://new.7-elevenapp.co.kr/api/v1/common/common-code/updated-list-all?last_date=<timestamp>`

## 5. 리플레이 실행

```bash
# 템플릿 파일에서 토큰/쿠키를 채운 뒤 실행
bash captures/seveneleven-cache-replay-20260314-r2/replay-curl-templates.sh
```

필수 교체 항목:

- `Authorization: Bearer <REPLACE_TOKEN>`
- `Cookie: <REPLACE_COOKIE>`

## 6. 주의사항

- `last_date`는 시간값이라 만료/유효성 검증에 걸릴 수 있음
- `common-code` 계열은 초기화 API일 가능성이 높아, 재고 API는 추가 수집 필요
- 민감정보(토큰/쿠키/기기 식별자)는 문서/커밋에 포함하지 않음

## 7. 2026-03-14 검증 결과

캐시 JS에서 API 경로를 추가 추출해 GET 프로브를 수행했습니다.

- 프로브 파일: `captures/seveneleven-js-api-probe-20260314-r3/probe-summary.txt`
- 추출 스크립트: `scripts/seveneleven-js-api-paths-extract.sh`

확인된 상태:

- `200`:
  - `/api/v1/common/common-code/APP003/`
  - `/api/v1/common/common-code/list-all`
  - `/api/v1/common/common-code/updated-list-all?...`
  - `/api/v1/share/installImage`
- `401`:
  - `/api/v1/setting` (인증 필요)
- `405`:
  - `/api/v1/open/search/store` (메서드 불일치 가능성)
- `503`:
  - `/api/v1/clause`
  - `/api/v1/share/deepLink/externalDeepLinkCheck`
- `404`:
  - 다수 엔드포인트는 path parameter/body 없이 루트 호출되어 404

해석:

- `open/stock/search`, `open/real-stock`, `stock/search`, `store/*`는 존재 가능성이 높음
- 다만 메서드/세부 경로/요청 body를 맞춰야 실제 리플레이 성공 가능

## 8. 자동 리플레이 배치 (실행 가능 세트)

아래 스크립트는 현재까지 확인된 엔드포인트를 한 번에 호출하고
성공(OPEN) / 인증필요(AUTH) / 차단(RSA/서비스미사용)을 분류합니다.

```bash
bash scripts/seveneleven-open-replay-batch.sh \
  --out captures/seveneleven-replay-batch-20260314-r12

# 직전 결과에서 HTTP 200만 빠르게 재검증
bash scripts/seveneleven-open-replay-batch.sh \
  --success-only-from captures/seveneleven-replay-batch-20260314-r12/summary.tsv \
  --out captures/seveneleven-replay-batch-20260314-r13-success-only
```

주요 산출물:

- `summary.tsv`: 기계 처리용 결과
- `summary.txt`: 사람이 보기 쉬운 표
- `summary.md`: 요약 리포트
- `responses/*.body`: 엔드포인트별 원본 응답

## 9. 2026-03-14 r12 배치 결과 요약

- 전체 요청: `22`
- `HTTP 200`: `17`
- `401 인증 필요`: `3`
- `500 + body code 503(service_unavailable)`: `2`

즉시 재현 가능한 대표 엔드포인트:

- `GET /api/v1/common/common-code/list-all`
- `GET /api/v1/product/pages`
- `GET /api/v1/product/issues`
- `POST /api/v1/open/search/goods`
- `POST /api/v1/open/search/popword?label=home`

현재 차단된 영역:

- `/api/v1/open/stock/search/stores`
- `/api/v1/stock/search/stores`

위 두 엔드포인트는 현재 payload로는 `서비스를 사용할 수 없습니다(code:503)`를 반환합니다.
이전 실측에서 확인된 `RSA 복호화 실패`와 함께 볼 때, 앱 내부 암호화/서명 흐름 확보 전까지
안정적인 리플레이가 어렵습니다.
