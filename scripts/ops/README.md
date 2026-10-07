# Operations Scripts

운영, 릴리스, CI에서 반복 실행되는 스크립트를 둡니다.

- `mcp-smoke.ts`: 배포된 MCP 엔드포인트의 필수 도구와 대표 호출을 검증합니다.
- `cli-smoke.ts`: 빌드된 CLI의 대표 사용자 흐름을 검증합니다.
- `generate-openapi.ts`: 배포/패키징에 필요한 OpenAPI 산출물을 생성합니다.
- `workers-chart-data.ts`, `workers-chart-helpers.ts`, `update-workers-invocations-chart.ts`: Cloudflare Workers 호출량 차트를 갱신합니다.

운영 스크립트는 `npm run` 명령에서 참조되며, 입력과 실패 메시지는 자동화 로그만으로 원인 추적이 가능해야 합니다.

## Workers 호출량 차트

새 데이터를 가져와 `scripts/ops/README.md`와 `assets/analytics/` 산출물을 갱신하려면 다음 환경 변수가 필요합니다.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CF_WORKER_SCRIPT_NAME` (기본값: `daiso-mcp`)

`GET /`를 R2로 리다이렉트한 뒤 Worker를 우회하는 루트 요청은 Cloudflare zone analytics 보존기간 안에서만 보정합니다. 기본 보정 기간은 `WORKERS_CHART_ROOT_REQUESTS_RETENTION_DAYS=7`입니다.

기존 JSON으로 그래프만 다시 렌더링할 때는 Cloudflare 키 대신 `WORKERS_CHART_INPUT_JSON=assets/analytics/workers-invocations.json`을 지정할 수 있습니다.

<!-- WORKERS_INVOCATIONS_CHART:START -->
<div align="center">

<h3>Cloudflare 요청 수 (2026-09-07 ~ 2026-10-06, 30일)</h3>

<img src="../../assets/analytics/workers-invocations.png?v=2026-10-06T20:21:54.180Z" alt="Cloudflare 요청 수 그래프 (2026-09-07 ~ 2026-10-06)" width="100%">

<sub>기준 워커: <code>daiso-mcp</code> · 마지막 갱신: 2026-10-07 05:21 KST</sub>
<br><sub>집계: Worker 실행 + 루트 GET 리디렉션 요청 · 사용자 수와 다릅니다.</sub>

</div>

> [!IMPORTANT]
> 최근 공개 서버 사용량이 크게 증가하여 2026년 7월 18일부터 올리브영·CGV·CU·GS25의 검색을 포함한 공개 GET API에 IP당 하루 합산 3,000회(KST 기준)의 호출 제한을 적용합니다. 한도를 초과하는 사용이 필요하다면 Daiso MCP는 오픈 소스이므로 이 저장소를 직접 배포해 이용해 주세요.

<!-- WORKERS_INVOCATIONS_CHART:END -->

### 운영 헬스 체크

공개 상태 페이지: **[Daiso MCP Status](https://aka-page.betteruptime.com/)**

주변 음식점/카페 검색은 네이버 지역 검색 API를 사용합니다. 로컬 실행이나 배포 환경에는 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 설정하세요.

서비스별 API 상태를 즉시 확인할 때는 `GET /api/health/checks`를 사용합니다. 이 엔드포인트는 `HEALTH_CHECK_SECRET` 환경 변수가 설정되어 있어야 하며, 요청에는 `Authorization: Bearer <secret>` 또는 `x-health-check-key: <secret>` 헤더가 필요합니다. 내부 체크 요청의 기준 URL은 `HEALTH_CHECK_BASE_URL`로 지정할 수 있습니다.

```bash
curl -H "Authorization: Bearer $HEALTH_CHECK_SECRET" \
  "https://mcp.aka.page/api/health/checks?mode=full&fresh=true&includeSamples=true&timeoutMs=20000&slowThresholdMs=9000"
```

주요 쿼리:

- `service=gs25`: 특정 서비스만 확인
- `check=daiso.products`: 특정 체크만 확인
- `mode=quick|deep|full`: 체크 모드 선택
- `fresh=true`: 60초 캐시 우회
- `includeSamples=true`: 첫 결과 이름 샘플 포함
- `timeoutMs=20000`: 체크별 요청 제한 시간
- `slowThresholdMs=9000`: 지정 시간보다 느린 성공 응답을 degraded로 표시

Health Checks 알림은 모든 실패·저하 서비스 ID를 상세 오류보다 먼저 표시합니다. 푸시 알림은 3,500자로 제한되며 전체 오류와 샘플은 해당 실행의 GitHub Actions 요약에 남습니다. 올리브영 릴레이의 설정 완전성은 `config.oliveyoungRelay`로 확인할 수 있습니다. 이 값은 연결 성공을 뜻하지 않으며, [설정 진단 문서](../../docs/oliveyoung-free-relay.md#설정-진단)를 참고하세요.

Zyte 유료 요청은 키 설정 여부와 관계없이 비활성화되어 있습니다. 직접 JSON 요청이 실패하면 원래 HTTP 상태와 오류를 유지합니다.

상태 기준:

- `ok`: 필수 응답 구조와 최소 결과가 정상입니다.
- `degraded`: 기능은 살아 있지만 빈 결과, 느린 응답, 응답 구조 변화 등 확인이 필요합니다.
- `fail`: 외부 API 오류, 타임아웃, 인증 문제처럼 실제 장애로 봐야 합니다.

Better Stack 같은 외부 모니터링에서는 `fail`을 장애 알림 기준으로 보고, `degraded`는 느린 외부 API나 응답 품질 저하를 추적하는 경고 신호로 봅니다.

### 운영 통계

일일 호출 제한으로 차단한 요청의 집계는 인증된 `GET /api/rate-limit/stats`에서 조회합니다. 헬스 체크와 같은 `HEALTH_CHECK_SECRET`을 사용하며, 다음 두 인증 헤더를 모두 지원합니다.

```bash
curl -H "Authorization: Bearer $HEALTH_CHECK_SECRET" \
  "https://mcp.aka.page/api/rate-limit/stats"

curl -H "x-health-check-key: $HEALTH_CHECK_SECRET" \
  "https://mcp.aka.page/api/rate-limit/stats?service=cgv"
```

쿼리 필터는 `from`, `to`, `service`입니다. `from`과 `to`는 함께 지정하거나 둘 다 생략해야 하며 날짜 형식은 `YYYY-MM-DD`입니다. `service`에는 `oliveyoung`, `cgv`, `cu`, `gs25`, `lottemart`만 사용할 수 있습니다. `lottemart` 필터는 지원 중단 전 호출 제한 통계를 조회하기 위해 유지합니다. 날짜를 생략하면 현재 KST 일자를 포함한 최근 7일을 조회합니다. 조회 가능한 보관 범위는 현재 KST 일자와 그 이전 29일이며, 한 번에 KST 달력 날짜 기준 최대 30일을 요청할 수 있습니다.

성공 응답은 전체 합계와 일별·서비스별 차단 요청 수와 고유 차단 주체 수를 제공합니다.

```json
{
  "success": true,
  "data": {
    "totals": {
      "blockedRequests": 3,
      "uniqueIdentities": 2
    },
    "daily": [
      {
        "day": "2026-07-22",
        "blockedRequests": 3,
        "uniqueIdentities": 2
      }
    ],
    "services": [
      {
        "day": "2026-07-22",
        "service": "cgv",
        "blockedRequests": 3,
        "uniqueIdentities": 2
      }
    ]
  }
}
```

데이터는 30일 동안 보관하며 집계 응답은 원본 호출 주체나 IP를 노출하지 않습니다. Worker가 생성한 `DAILY_RATE_LIMIT_EXCEEDED` 결정 중 원장 커밋에 성공한 경우만 정확한 집계 범위에 포함됩니다. Cloudflare 또는 네트워크 계층의 429와 클라이언트 전송 결과, 연결 종료 결과는 이 범위에 포함되지 않습니다. 원장 쓰기에 실패하면 요청을 fail-open 처리하고 애플리케이션 429를 반환하지 않습니다. 통계는 이 기능의 배포 시점부터 수집하며 이전 429는 소급 집계하지 않습니다.

배포 전 로컬에서 CLI 모드까지 확인할 때는 아래 명령을 사용합니다.

```bash
npm run cli:smoke
```

기본 `openapi.json`은 OpenAI Actions import 제한에 맞추기 위해 `GET /api/actions/query` 단일 facade만 노출합니다.
기존 서비스별 GET API는 유지되며, 자세한 배경은 [OpenAPI Actions Facade 문서](../../docs/openapi-actions-facade.md)에 정리했습니다.

인터랙티브 예시:

```text
$ npx daiso
daiso 인터랙티브 모드

[서비스 선택]
1. 다이소
2. 올리브영
3. CU
서비스 번호를 선택하세요 (0: 종료): 1

매장 검색 키워드를 입력하세요: 강남

[매장 선택]
1. 다이소 강남점 | 서울 강남구 ...
2. 다이소 강남역점 | 서울 강남구 ...
입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 다시 검색
선택: /역점
선택: 1

[선택한 매장 정보]
- 매장명: 다이소 강남역점
- 주소: 서울 강남구 ...
- 전화: 02-...

찾을 상품 키워드를 입력하세요: 수납박스

[상품 선택]
1. 손잡이 수납박스 (2000원, ID: 1034604)
2. 접이식 수납박스 (3000원, ID: 1034605)
입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 취소
선택: 1

[재고 결과]
- 상품: 손잡이 수납박스
- 매장: 다이소 강남역점
- 재고 수량: 7

[다음 동작]
1. 같은 매장에서 다른 상품 찾기
2. 다른 매장/서비스 다시 선택하기
3. 종료하기
번호를 선택하세요: 3
인터랙티브 모드를 종료합니다.
```

<br>
