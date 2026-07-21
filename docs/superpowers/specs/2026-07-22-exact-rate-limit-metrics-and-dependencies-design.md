# 정확한 429 계측 및 의존성 정비 설계

## 배경

다이소 MCP Worker는 검색 API에 KST 일자 기준 IP·호출 주체별 3,000회 제한을 적용한다. 현재 제한 자체는 Durable Object의 강한 일관성을 이용해 정확히 집행하지만, 제한을 초과해 반환한 429 응답은 별도로 집계하지 않는다. Cloudflare GraphQL 호출량은 수집 지연과 샘플링이 있어 정확한 차단 수를 증명할 수 없다.

동시에 Dependabot 업데이트 PR 9건과 `npm audit` 보안 경고가 열려 있다. 호환 가능한 업데이트는 일괄 검증하되, 지원되지 않는 TypeScript 7 조합을 강제 설치하지 않아야 한다.

Zyte 요금제 상향은 비용이 오픈소스 운영 수준에 비해 높다는 판단에 따라 이번 범위에서 제외한다.

## 목표

- Worker가 생성하기로 결정한 `DAILY_RATE_LIMIT_EXCEEDED` 429 한 건마다 원장 한 건이 먼저 확정되게 한다.
- 일별·서비스별 차단 요청 수와 고유 차단 주체 수를 인증된 운영 API에서 정확히 조회한다.
- 원본 IP와 역추적에 직접 쓸 수 있는 단순 IP 해시를 원장에 보관하지 않는다.
- 계측 장애 때문에 정상 사용자를 차단하지 않는다.
- 호환 가능한 Dependabot 업데이트와 npm 보안 경고를 정리하고 전체 회귀 검증을 통과한다.
- 기존 Durable Object 바인딩과 배포 마이그레이션을 늘리지 않는다.

## 비목표

- Zyte 결제 한도 또는 요금제 변경
- 모든 Cloudflare·네트워크 계층 429 집계
- 개별 IP나 호출 주체를 운영 API에 노출하는 기능
- TypeScript 7을 지원 범위 밖에서 강제 설치하는 작업

## 정확한 429 계측

### 원장 구조

기존 `DAILY_RATE_LIMITER` 네임스페이스에 예약된 단일 Durable Object 이름 `__blocked-ledger-v1__`을 사용한다. 기존 객체는 호출 주체별 할당량을 계속 저장하고, 예약 객체만 차단 이벤트 원장을 담당한다. 같은 SQLite Durable Object 클래스를 재사용하므로 `wrangler.toml` 바인딩이나 Durable Object 마이그레이션은 추가하지 않는다.

원장 테이블은 다음 정보를 저장한다.

```sql
blocked_events (
  event_id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  service TEXT NOT NULL,
  identity_id TEXT NOT NULL
)
```

- `event_id`: 재시도 중복 기록을 막는 UUID
- `occurred_at`, `day`: KST 기준 발생 시각과 날짜
- `service`: 허용 목록으로 검증한 서비스 식별자
- `identity_id`: 이미 할당량 객체 조회에 사용한 namespace-scoped Durable Object ID 문자열

`identity_id`는 운영 API 응답에 포함하지 않는다. 원본 IP와 IP의 SHA-256 문자열도 원장 요청·저장소에 전달하지 않는다. `(day, service)`, `(day, identity_id)`, `(day, service, identity_id)` 인덱스로 집계를 지원한다.

### 요청 흐름과 정확성 경계

1. 보호 대상 GET 경로에서 서비스와 호출 주체를 한 번 해석한다.
2. 현재와 동일하게 호출 주체별 Durable Object에서 KST 일일 할당량을 소비한다.
3. 허용된 요청은 현재 동작을 유지한다.
4. 초과 요청이면 이벤트 UUID를 만들고 예약 원장 객체에 동기식으로 기록한다.
5. 원장 커밋 확인 후에만 애플리케이션 429를 반환한다.

원장 기록에 실패하면 해당 요청은 fail-open 처리한다. 따라서 계측 장애가 잘못된 차단으로 이어지지 않으며, 애플리케이션이 생성하기로 확정한 모든 429에는 원장 행이 존재한다. 클라이언트 연결 종료나 Cloudflare 자체 429처럼 Worker 바깥에서 발생한 전송 결과는 이 정확성 범위에 포함하지 않는다.

### 집계 API

다음 인증 API를 추가한다.

```text
GET /api/rate-limit/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&service=cgv
```

- 기존 `HEALTH_CHECK_SECRET`을 재사용한다.
- `Authorization: Bearer`와 `x-health-check-key`를 모두 지원한다.
- 비밀값 미설정은 503, 누락·불일치 인증은 401을 반환한다.
- 기본 조회 기간은 최근 7일, 최대 범위는 보관 기간인 30일이다.
- 전체 합계와 일별·서비스별 차단 요청 수, 고유 차단 주체 수만 반환한다.
- 원장 조회 실패는 잘못된 0 대신 503을 반환한다.

헬스체크 경로의 기존 인증 로직은 공용 운영 인증 모듈로 추출하고 응답 동작을 회귀 테스트로 보존한다.

### 보관과 정리

원장 보관 기간은 30일이다. 첫 기록 시 일일 alarm을 예약하고 alarm에서 오래된 행을 삭제한다. alarm은 재시도되어도 안전한 멱등 삭제로 구현한다. alarm 지연 시 보관 기간이 무한히 늘지 않도록 기록·조회 시에도 제한적인 보조 정리를 수행한다.

## 의존성 정비

### 호환 가능한 업데이트

현재 최신 호환 버전으로 한 번에 lockfile을 재생성하고 조합 상태를 검증한다.

- Hono
- `typescript-eslint`
- `@cloudflare/workers-types`
- `tsx`
- Biome와 `biome.jsonc` 스키마 URL
- Wrangler
- Prettier
- GitHub Actions `setup-node` v7

Wrangler와 Workers 타입은 서로의 peer dependency가 맞는 조합으로 함께 올린다. `setup-node`는 Dependabot PR이 변경한 7개 워크플로에 동일하게 적용한다.

### TypeScript 7

TypeScript 7 PR은 병합하지 않는다. 최신 `typescript-eslint`도 TypeScript `>=4.8.4 <6.1.0`만 지원하므로 현재 PR은 `npm ci`에서 `ERESOLVE`로 실패한다. TypeScript 6.0.3을 유지하고 PR #138에 근거를 남겨 닫는다. `--force`와 `--legacy-peer-deps`는 사용하지 않는다.

### 보안 경고

`npm audit --json`의 직접·전이 경로를 확인해 호환되는 상위 패키지 업데이트 또는 최소 범위 override로 제거한다. 현재 조사 대상에는 `brace-expansion`, `body-parser`, `fast-uri`, `linkify-it`, `@hono/node-server` 및 MCP SDK 경로가 포함된다. 각 변경은 lockfile만 바꾸는 것으로 끝내지 않고 MCP·HTTP 회귀 테스트로 런타임 호환성을 확인한다.

## 테스트 전략

구현은 실패하는 테스트를 먼저 추가하는 TDD 순서로 진행한다.

- Durable Object 원장: 중복 이벤트, 반복·분리 호출 주체, 서비스 집계, KST 경계, 30일 보관, alarm 재시도
- 미들웨어: 원장 커밋 전 429 금지, 기록 실패 fail-open, 이벤트 1회 기록, 원본 IP·단순 해시 미전달
- 앱 통합: 생성된 429와 원장 기록의 1:1 관계, 보호·비보호 경로 회귀
- 집계 API: 503·401·인증 성공, 기간·서비스 검증, 집계 전용 응답, 저장소 장애 503
- 헬스체크: 공용 인증 추출 전후의 기존 동작 보존
- 의존성: 설치, 포맷, ESLint, Biome, 타입 검사, 전체 테스트, 100% 커버리지, 빌드, npm audit

## 배포와 운영 확인

기능·의존성 변경을 같은 작업 브랜치에서 검증하되 논리적인 커밋으로 분리한다. main 반영 후 CI/CD 성공과 Cloudflare 배포 버전을 확인한다. 인증된 통계 API가 빈 기간에는 정확한 0을, 장애에는 503을 반환하는지 확인하고, 실제 제한 테스트는 운영 카운터를 불필요하게 소모하지 않는 범위에서 수행한다.

정확한 집계는 새 코드가 배포된 시점부터 시작하며 이전 429를 소급 복원하지 않는다.
