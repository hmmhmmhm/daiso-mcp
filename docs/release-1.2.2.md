# 1.2.2 운영 진단과 의존성 유지보수

## 변경

- 무료 직접 요청이 400/403/429로 실패할 때 원본 HTTP 오류를 보존합니다. 기존 Zyte 키가 설정되어 있어도 비용 정책 메시지로 원본 오류를 덮지 않습니다. 유료 Zyte 호출 차단은 유지합니다.
- `/health`의 `config.oliveyoungRelay`에서 릴레이 URL·토큰과 선택적 Access 인증 쌍의 설정 상태를 확인할 수 있습니다. 설정이 유효하다는 뜻이며 브라우저가 실제 실행 중이거나 올리브영 조회가 성공한다는 보장은 아닙니다. 비밀 값은 반환하지 않습니다.
- Health Checks 알림에서 모든 실패·저하 체크 ID를 상세 메시지보다 먼저 표시하고 전체 상세를 Actions 요약에 남깁니다.
- Worker secrets 동기화에 네 OY 설정을 포함합니다. GitHub에 값이 없는 설정은 건너뛰므로 수동으로 설정한 Worker secret을 지우지 않습니다.
- Hono, Wrangler, Cloudflare 타입, ESLint, typescript-eslint, Biome, Prettier, tsx, Node 타입 및 호환 범위의 간접 의존성을 갱신합니다.

## 복구 여부와 후속 작업

올리브영은 전용 Mac 표준 계정의 GUI 로그인, Tunnel, Access 및 Worker secrets 연결이 완료되어야 복구됩니다. 진단 개선만으로 업스트림 차단이 해제되지는 않습니다. 2026-09-19 로컬 headed Chromium에서 실제 재고 조회 두 건이 성공했고, 부모 프로세스 SIGKILL 후 추적한 Chrome·crashpad 12개 프로세스의 잔여 수는 0개였습니다. 종료 전 관측 RSS는 약 783MiB였습니다. 이는 장기간 무누수 보장이 아닙니다.

디트릭스 PR #188의 표준 포트 변경은 보류합니다. 2026-09-19 production과 같은 compatibility_date 및 요청으로 임시 인증 Worker에서 비교한 결과, 443은 두 번 모두 10초 timeout, 30443은 한 번 timeout과 한 번 HTTP 200(18개 영화)였습니다. 시험 Worker는 삭제했습니다. 로컬 응답 동일성과 상수 테스트만으로 Worker 장애 해결을 증명할 수 없습니다. 전체 실패 시 503을 성공으로 바꾸거나 동일 시간 예산을 임의로 쪼개어 재시도하지 않습니다.

TypeScript 7은 typescript-eslint의 지원 범위 `>=4.8.4 <6.1.0` 밖입니다. Vitest와 coverage-v8는 함께 5.0.1로 갱신하고 지원되는 Node 24에서 검증합니다. 개발 검증에는 Node 24 LTS를 사용하세요. 기존 Node 25는 Vitest 5의 지원 범위 밖입니다.
