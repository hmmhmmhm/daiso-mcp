# Operations Scripts

운영, 릴리스, CI에서 반복 실행되는 스크립트를 둡니다.

- `mcp-smoke.ts`: 배포된 MCP 엔드포인트의 필수 도구와 대표 호출을 검증합니다.
- `cli-smoke.ts`: 빌드된 CLI의 대표 사용자 흐름을 검증합니다.
- `generate-openapi.ts`: 배포/패키징에 필요한 OpenAPI 산출물을 생성합니다.
- `workers-chart-data.ts`, `workers-chart-helpers.ts`, `update-workers-invocations-chart.ts`: Cloudflare Workers 호출량 차트를 갱신합니다.

운영 스크립트는 `npm run` 명령에서 참조되며, 입력과 실패 메시지는 자동화 로그만으로 원인 추적이 가능해야 합니다.

## Workers 호출량 차트

새 데이터를 가져와 `README.md`와 `assets/analytics/` 산출물을 갱신하려면 다음 환경 변수가 필요합니다.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CF_WORKER_SCRIPT_NAME` (기본값: `daiso-mcp`)

`GET /`를 R2로 리다이렉트한 뒤 Worker를 우회하는 루트 요청은 Cloudflare zone analytics 보존기간 안에서만 보정합니다. 기본 보정 기간은 `WORKERS_CHART_ROOT_REQUESTS_RETENTION_DAYS=7`입니다.

기존 JSON으로 그래프만 다시 렌더링할 때는 Cloudflare 키 대신 `WORKERS_CHART_INPUT_JSON=assets/analytics/workers-invocations.json`을 지정할 수 있습니다.
