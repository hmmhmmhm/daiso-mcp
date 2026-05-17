# Scripts

이 디렉터리는 운영에 쓰는 스크립트와 외부 서비스 분석용 리서치 스크립트를 분리해서 보관합니다.

## 운영 스크립트

- `scripts/ops/mcp-smoke.ts`: 배포된 MCP 엔드포인트에서 대표 도구 목록과 호출 결과를 확인합니다.
- `scripts/ops/cli-smoke.ts`: 빌드된 CLI가 주요 사용자 시나리오를 처리하는지 확인합니다.
- `scripts/ops/generate-openapi.ts`: API 라우트 기반 OpenAPI 산출물을 생성합니다.
- `scripts/ops/workers-chart-data.ts`, `scripts/ops/update-workers-invocations-chart.ts`: Cloudflare Workers 호출량 차트를 갱신합니다.

운영 스크립트는 CI나 릴리스 절차에서 반복 실행될 수 있어야 하며, 실패 메시지는 원인 추적에 필요한 명령/도구/응답 일부를 포함해야 합니다.

## 리서치 스크립트

- `scripts/research/`: 리서치 스크립트의 운영 정책과 분리 기준을 문서화합니다.
- `gs25-*.ts`, `gs25-*.sh`: GS25 앱/네트워크 응답 구조 분석과 재현 실험에 사용합니다.
- `frida/`: 모바일 앱 런타임 관찰용 Frida 훅입니다.
- `mitm/`, `mitmproxy/`: 프록시 캡처와 재생 실험용 스크립트입니다.
- `seveneleven-*.sh`: 세븐일레븐 공개/앱 엔드포인트 재현 실험에 사용합니다.

리서치 스크립트는 운영 경로와 분리해서 다룹니다. CI에서 실행하지 않는 실험 스크립트는 입력 파일, 사용법, 생성 산출물을 파일 상단 또는 인접 문서에 명시합니다.
