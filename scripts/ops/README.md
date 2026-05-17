# Operations Scripts

운영, 릴리스, CI에서 반복 실행되는 스크립트를 둡니다.

- `mcp-smoke.ts`: 배포된 MCP 엔드포인트의 필수 도구와 대표 호출을 검증합니다.
- `cli-smoke.ts`: 빌드된 CLI의 대표 사용자 흐름을 검증합니다.
- `generate-openapi.ts`: 배포/패키징에 필요한 OpenAPI 산출물을 생성합니다.
- `workers-chart-data.ts`, `workers-chart-helpers.ts`, `update-workers-invocations-chart.ts`: Cloudflare Workers 호출량 차트를 갱신합니다.

운영 스크립트는 `npm run` 명령에서 참조되며, 입력과 실패 메시지는 자동화 로그만으로 원인 추적이 가능해야 합니다.
