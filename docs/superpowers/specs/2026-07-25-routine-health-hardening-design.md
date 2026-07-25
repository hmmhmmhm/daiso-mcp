# 정기 점검 후속 정비 설계

## 목표

2026년 7월 25일 정기 점검에서 확인된 개발 의존성 취약점, 450줄 임계 파일,
반복 실패 알림의 부재, External Smoke 러너 취소 가능성을 한 번에 정비한다.
공개 API와 MCP 응답 계약은 바꾸지 않으며, 운영 비용을 추가하지 않는다.

## 검토한 접근

### 최소 패치

취약한 lockfile과 GitHub secret만 수정하고 나머지는 그대로 둔다. 변경 위험은 가장
낮지만 450줄 임계 파일, 자동 줄 수 검사 부재, 15개 Smoke 러너의 중복 설치와 취소
가능성이 남는다.

### 균형형 정비

호환 가능한 의존성을 갱신하고, 임계 파일을 책임별로 분리하며, 줄 수 검사를 CI에
추가한다. External Smoke는 한 러너에서 순차 실행하고 실패를 한 번만 알린다.
Health 알림은 일일 full 점검으로 제한한다. 현재 문제를 직접 해결하면서 별도 저장소나
유료 서비스를 만들지 않으므로 이 방식을 선택한다.

### 장애 상태 저장

Durable Object나 별도 데이터베이스에 이전 장애 상태를 저장해 상태 전환 때만 알린다.
정교한 중복 억제가 가능하지만 새 운영 상태와 비용, 장애 복구 로직이 필요해 현재
규모에는 과하다.

## 설계

### 의존성 안전성

- `brace-expansion`을 취약하지 않은 5.0.8 이상으로 고정되는 lockfile로 갱신한다.
- `@cloudflare/workers-types`, ESLint, Hono, Playwright, Wrangler는 현재 호환 범위의
  최신 패치 또는 마이너 버전으로 올린다.
- TypeScript 7은 `typescript-eslint`의 지원 범위를 벗어나므로 6.0.3을 유지한다.
- 전체 audit와 production-only audit를 모두 실행해 개발·운영 의존성을 구분한다.

### 450줄 제한

- `src/pages/openapiSpecActions.ts`의 쿼리 파라미터 정의를 별도 모듈로 옮긴다.
- `src/cliHelp.ts`의 명령 데이터 정의를 별도 모듈로 옮기고 출력 로직만 남긴다.
- `src/services/lottemart/session.ts`의 raw socket 전송과 HTTP 응답 변환을 별도
  전송 모듈로 옮긴다.
- `scripts/quality/check-source-line-limit.ts`가 모든 `src/**/*.ts` 파일을 재귀
  탐색해 450줄 초과 파일을 경로와 줄 수로 보고하고 실패 종료한다.
- 경계값 450줄은 허용하고 451줄부터 실패한다. 자동 생성된 `src` 파일은 현재
  없으므로 예외 목록을 만들지 않는다.
- npm `check:source-lines`, 통합 `check`, GitHub CI에 동일 검사를 연결한다.
- AGENTS와 CONTRIBUTING에는 제한이 CI로 강제된다는 사실을 명시한다.

### External Smoke

- 15개 매트릭스 작업을 단일 `external-smoke` 작업으로 바꾼다.
- 의존성 설치와 CLI 빌드는 한 번만 수행한다.
- 기존 서비스 목록을 CLI, MCP 순서로 한 개씩 실행한다. 각 서비스는 한 번 실패하면
  15초 후 한 번 재시도한다.
- 한 서비스가 최종 실패해도 다음 서비스 점검을 계속하고, 마지막에 실패 서비스
  목록을 `external-smoke-summary.txt`로 집계한 뒤 작업을 실패 처리한다.
- 작업에 명시적 제한 시간을 두고, 모든 명령은 순차 실행해 외부 서비스와 GitHub
  러너에 동시에 부하를 주지 않는다.
- 실패 알림은 예약 실행에서만 한 번 전송한다. 수동 실행은 작업 로그로 확인한다.

### Health 알림

- quick와 full 점검의 실패 판정은 그대로 유지해 GitHub Actions 기록을 숨기지 않는다.
- Moshi 푸시는 한국시간 자정의 일일 full 예약 실행이 실패할 때만 전송한다.
- 반복 quick 실패와 수동 점검은 푸시하지 않는다.
- 구현과 배포 검증이 끝난 뒤 저장소 Actions secret에 `MOSHI_WEBHOOK_TOKEN`을
  등록한다. 값은 로그와 문서에 기록하지 않는다.

## 오류 처리

- 줄 수 검사기는 `src`를 읽지 못하면 성공으로 간주하지 않고 오류와 함께 실패한다.
- Smoke는 서비스별 종료 코드와 출력 일부를 보존해 실패 원인을 요약한다.
- Moshi token이 없거나 알림 전송이 실패해도 원래 Health/Smoke 실패 결과는
  덮어쓰지 않는다.
- 알려진 Zyte 403과 외부 WAF 장애를 성공으로 바꾸지 않는다. GitHub 실패 상태는
  실제 가용성 신호로 유지한다.

## 테스트와 검증

- 줄 수 계산과 450/451 경계, 재귀 탐색, 정렬된 위반 보고를 단위 테스트한다.
- 저장소 설정 회귀 테스트로 npm script, CI, 순차 Smoke, 일일 full 알림 조건을
  고정한다.
- 파일 분리 전후의 기존 OpenAPI, CLI 도움말, 롯데마트 세션 테스트를 그대로
  통과시켜 공개 동작 보존을 확인한다.
- 모든 테스트는 `--maxWorkers=1 --no-file-parallelism`으로 순차 실행한다.
- 최종적으로 format, ESLint, Biome, TypeScript, 100% coverage, build,
  `wrangler deploy --dry-run`, npm audit를 확인한다.
- PR CI가 통과하면 main에 병합하고 CI/CD 배포 완료 후 production `/health`와
  Worker 버전을 확인한다.

## 범위 밖

- 외부 Zyte 계정의 결제 한도 상향과 새 유료 프록시는 추가하지 않는다.
- 알려진 외부 장애를 정상으로 분류하거나 Health 실패를 숨기지 않는다.
- TypeScript 7 전환과 Durable Object 기반 장애 상태 저장은 별도 작업으로 남긴다.
