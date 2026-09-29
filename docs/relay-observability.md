# 릴레이 캐시 및 장애 추적

## 요청 ID로 찾기

REST/MCP HTTP 응답의 `x-request-id`를 확보한다. Worker 진단 로그의 `requestId`와 맥 릴레이 JSONL에서 같은 값을 찾으면 요청 경계를 연결할 수 있다. 동시에 합쳐진 OY 요청은 `parentRequestId`로 실제 실행을 맡은 요청을 찾는다. 내부 Actions 호출도 같은 ID를 유지한다.

Worker는 모든 REST/MCP 요청 경계와 MCP 도구 결과, 공용 HTTP 유틸리티에서 실패를 기록한다. 성공은 요청 단위 1% 표본이며 요청당 최대 32개 이벤트를 기록한다. 개별 서비스가 자체 fetch를 쓸 경우 공용 HTTP 단계는 없을 수 있지만 REST/MCP 경계와 두 릴레이에는 기록이 남는다. 재시도·기존 결과 반환으로 최종 성공한 요청도 중간 HTTP 오류는 기록될 수 있다. Cloudflare 자체 장애로 코드가 실행되지 않은 경우에는 플랫폼 상태/Analytics를 함께 확인한다.

Cloudflare Workers Observability에서 `event = diagnostic`, `requestId = <ID>`로 조회한다. 로그는 플랫폼에서 보존한다(현재 Free 3일/Paid 7일). 무제한 로컬 복사 작업은 없다. 자동 invocation 로그는 비활성화하고 커스텀 로그만 사용한다. 플랫폼이 덧붙이는 요청 URL에서도 query를 제거하도록 `redact_query_string = true`를 설정한다. 로그 비용/계정 한도는 Cloudflare 정책의 영향을 받는다.

- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/

## 맥 로그 위치와 상한

각 `OY_RELAY_STATE_DIR/logs`, `DTRYX_RELAY_STATE_DIR/logs`에 `서비스-생성시각-uuid.jsonl`이 생성된다. 디렉터리 0700, 새 로그 파일 0600이다.

| 항목 | 제한 |
| --- | --- |
| 파일 하나 | 4 MiB |
| 서비스 하나 합계 | 64 MiB |
| 현재 두 서비스 합계 | 128 MiB |
| 보존 | 생성 시각부터 7일, 용량 초과 시 오래된 파일부터 제거 |
| 디스크 여유 | 기록 후 최소 2 GiB 유지 확인 |
| 기록 대기 | 최대 256개, 각 이벤트 2 KiB 미만 |
| 유휴 정리 | 시작 시 및 1분 heartbeat 시 정리 |

로그 파일만 정리하며 다른 파일은 삭제하지 않는다. 새 프로세스도 기존 로그를 합산한다. 디스크 부족/ENOSPC/기록 오류/큐 초과에서는 이벤트를 버리고 요청 처리 자체는 계속한다. 여유가 회복되면 자동 기록 재개한다. 다른 프로그램의 디스크 사용까지 통제하는 기능은 아니다. 프로세스 강제 종료나 시스템 장애 직전의 대기 이벤트는 유실될 수 있다.

인증된 health의 `logging`에서 `queued`, `written`, `dropped`, `errors`, `lowSpace`를 확인한다. 이 카운터는 프로세스 재시작 시 초기화된다. 시작과 heartbeat에 quota 잔여량이 기록되고 `quota/consumed`는 OY 실제 실행 전에 차감된 호출을 의미한다. 집계는 JSONL의 UTC time, operation, stage, outcome을 사용한다. 보존 기간/용량/드롭을 함께 보고 숫자를 해석한다.

기록하는 값은 고정 분류, 요청 ID, 작업 종류, 단계, 상태, 소요 시간, 캐시 결과, 제한 사유, quota 잔여량이다. 검색어, 위치 좌표, 요청/응답 본문, 인증 헤더, IP, 임의 예외 메시지는 넣지 않는다. 조회 예:

```sh
rg --fixed-strings '확인할-request-id' "$OY_RELAY_STATE_DIR/logs" "$DTRYX_RELAY_STATE_DIR/logs"
```

## 원인 분류

- Worker 실패 로그는 있고 같은 ID의 릴레이 로그가 없음: relay 설정·네트워크·Cloudflare Access/Tunnel을 확인한다. 로컬 `logging.dropped/errors/lowSpace`도 먼저 점검한다.
- `quota` 단계와 429: health `quota.blockedBy`로 minute/daily를 구분하고 resetAt/Retry-After 이후 재시도한다. OY 응답은 `x-relay-quota-reason`도 제공한다.
- `queue/expired` 또는 busy: 큐/동시 요청 과부하와 클라이언트 취소를 확인한다.
- `upstream/error`: 서비스 원본/브라우저 실패. OY `lifecycle`의 launch-failed/startup-failed/request-failed/page-crash/rotation 원인과 비교한다.
- `process/startup-failed` 또는 heartbeat 단절: LaunchAgent 상태와 프로세스 시작 환경을 점검한다. cloudflared는 자체 플랫폼 상태도 확인한다.

## OY 캐시

인증과 payload 검증 뒤 공통 릴레이 캐시를 확인한다. REST와 MCP가 같은 조건을 요청하면 공유된다. 상품 검색/매장은 5분, 상품 ID는 10분, 재고는 1분 TTL이다. 최대 256항목 및 키·값 직렬화 16MiB, 오래된 항목부터 퇴출한다. 성공만 저장하며 동일 진행 요청은 합친다. 탭이나 브라우저를 추가하지 않는다.

캐시 적중은 quota를 소비하지 않는다. `x-relay-cache: hit/miss/coalesced` 및 health.cache로 확인한다. 서로 다른 검색이 대부분이면 절감 효과는 작다. quota는 기존 분당30/UTC 일일3000을 유지한다. REST 캐시도 별도로 존재하며 products5분/stores24시간/inventory10분이므로 외부 REST 응답의 최신성은 두 계층의 영향을 받는다. `_healthCheck`는 REST 캐시를 새로 조회하지만 공통 릴레이 캐시는 계속 적용된다.


## OY 요청 집중 보호 (1.2.7)

전역 상한(분당 30회, UTC 하루 3,000회)에 더해, 익명 소비자별 실제 신규 실행을 분당 12회로 제한한다. 요청 본문을 읽기 전부터 동시 미완료 요청은 소비자당 2개만 허용한다. 따라서 세 번째 동시 요청은 캐시 적중 여부를 확인하기 전에 거절될 수 있다. 캐시 적중과 진행 요청 합치기는 실행 횟수를 차감하지 않는다. 대기 작업은 용량을 예약하고 전역 quota를 통과한 실행 직전에 차감하며, 취소·만료·전역 quota 오류는 예약을 반환한다.

Worker는 Cloudflare 연결 IP(교차 존 Worker는 기존 일일 제한과 같은 CF-Worker 식별 기준)를 일별 HMAC으로 변환한다. 클라이언트가 보낸 소비자 헤더는 무시하며, 원문 IP와 HMAC 값은 로그에 기록하지 않는다. 같은 네트워크를 공유하는 사용자는 같은 한도를 공유할 수 있다. CLI처럼 HTTP 요청 문맥이 없는 호출은 공통 legacy 버킷을 사용한다. 소비자 표는 최대 1,024개이며 만료된 비활성 항목만 정리한다. 표가 가득 찬 동안 새 소비자는 제한한다.

검증된 릴레이 429의 `minute`/`daily` 제한은 해당 릴레이·인증 구성 전체에, `consumer` 제한은 해당 익명 소비자에만 Worker 재시도 대기 시간을 적용한다. 대기 정보도 최대 1,024개, 최대 24시간이며 Worker 인스턴스 안에서만 유지된다. REST의 `Retry-After`와 REST/MCP diagnostics의 `quotaReason`, `retryAfter`를 확인한다. 이미 있는 REST 캐시는 계속 사용할 수 있다. 이 기능은 허용량을 늘리지 않으며 정상적인 보호 429는 계속 발생할 수 있다.

health.cache의 `hits`, `misses`, `expired`, `evicted`는 프로세스 시작 이후 집계다. `expired`는 정리된 만료 항목 수이며, 개별 miss가 만료 때문인지 추적하는 별도 기록은 만들지 않는다.

## GitHub Health Checks 판정과 보존

quick/full 모두 새 검사 요약을 요청한다. 실패 후 한 번 재시도할 때는 REST 캐시도 우회한다. 공통 OY 릴레이 캐시는 유지한다. HTTP 실패 후 이전 성공 파일을 재사용하지 않으며, 비정상 JSON·빈 검사 목록·모순된 요약은 실패로 처리한다. 각 요청은 최대 240초, 전체 job은 최대 10분이다. 시도별 원본 JSON과 오류 요약은 Actions artifact로 7일 보관한다.

CGV는 `CGV_UPSTREAM_UNAVAILABLE`, API HTTP 503, 원본 HTTP 403이 모두 확인될 때만 `degraded`로 분류한다. 이는 해당 기능이 제한된 상태이며 복구를 뜻하지 않는다. 인증 오류, 타임아웃, JSON 파싱 실패 등은 계속 `fail`이다. 선택 데이터가 없는 `skipped` 검사는 정상 요약에 포함될 수 있다. Actions 성공 여부와 별도로 요약의 저하 서비스 목록을 확인해야 한다. 유료 Zyte 재시도는 활성화하지 않는다.
