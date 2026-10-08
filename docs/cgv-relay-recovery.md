# CGV 무료 중계 복구

2026-10-08 점검에서 Worker 직접 요청은 HTTP 403으로 차단되었으나, 같은 CGV 공식 API를 Mac에서 서명·브라우저 헤더와 함께 호출하면 HTTP 200을 반환했습니다. 인증된 로컬 중계 실측은 극장 174건, 영화 5건, 시간표 30건을 확인했습니다. 이 수치는 점검 시점의 결과이며 날짜와 극장에 따라 달라집니다.

CGV는 `/v1/cgv/{theaters,movies,timetable,timetable-movie}` 경로로 기존 Dtryx 4320 프로세스를 사용합니다. 별도 예산을 만들지 않고 `DTRYX_RELAY_TOKEN`, `DTRYX_RELAY_STATE_DIR/quota.json`, Dtryx 로그를 공유합니다. 기본 상한은 `scripts/relay/quota.ts`의 일 300,000회·분 300회이며 CGV와 Dtryx의 실제 중계 원본 요청을 합산합니다. CU·세븐일레븐·GS25의 별도 편의점 원장은 공유하지 않습니다.

중계는 검증된 성공 응답만 재사용합니다. 극장·영화 목록은 5분, 시간표·영화별 시간표는 30초 뒤 만료됩니다. 동일 작업과 조회 조건으로 겹친 진행 요청은 원본 조회와 예산을 한 번만 소비합니다. 원본 HTTP 오류·업무 오류는 캐시하지 않으며, 시간표 캐시가 만료되면 좌석 수량을 다시 조회합니다. 이 중계 캐시는 REST 캐시와 별도이며 MCP 요청에도 적용됩니다. 캐시는 설정된 분·일 예산 안에서 원본 호출을 줄입니다.

5분 주기 경로 점검은 CGV 직접 요청과 중계를 확인해 사용 가능한 경로를 선택합니다. 직접 경로가 차단되면 중계를 사용하고, 직접 경로가 회복되면 점검 결과에 따라 복귀합니다. 일반 요청 중 직접 실패도 경로 선택에 반영됩니다. `/health`의 `config.cgvRelay`는 유효 설정 여부만 나타내며 연결 성공을 뜻하지 않습니다.

## 설정

CGV 전용 설정이 하나도 없으면 `DTRYX_RELAY_URL`, `DTRYX_RELAY_TOKEN`, `DTRYX_ACCESS_CLIENT_ID`, `DTRYX_ACCESS_CLIENT_SECRET` 그룹 전체를 사용합니다. `CGV_*` 중 하나라도 정의하면 Dtryx와 값을 섞지 않고 CGV 그룹 전체를 사용합니다. 이때 `CGV_RELAY_URL`과 `CGV_RELAY_TOKEN`을 함께 설정하고, Access를 사용하면 `CGV_ACCESS_CLIENT_ID`와 `CGV_ACCESS_CLIENT_SECRET`도 함께 설정합니다. 빈 값도 정의된 설정으로 취급하므로 미사용 CGV 예시는 주석으로 두거나 삭제합니다. 공유 Dtryx 프로세스의 CGV 토큰은 실제 Dtryx 토큰과 같아야 합니다.

`/health`의 `config.cgvRelay`에서 `configured`, `urlValid`, `tokenConfigured`, `accessPairValid`를 확인합니다. 응답에는 URL·토큰·Access 원문을 노출하지 않습니다. 불완전한 설정은 `CGV_RELAY_CONFIG_ERROR`, 중계 실패는 `CGV_RELAY_FAILED`로 반환하며 HTTP 상태와 공개 진단을 REST·MCP에 보존합니다.

Cloudflare Tunnel의 공개 호스트 경로도 4320으로 연결해야 합니다. 운영 `oy-relay.aka.page`에서는 기존 Dtryx 규칙을 `^/v1/(dtryx|cgv)/.*$`로 지정하고, 올리브영 포트 4319의 `*` 규칙보다 앞에 둡니다. `/v1/convenience/`도 기존 4320 규칙을 유지합니다. CGV 경로가 4319로 전달되면 로컬 건강 응답이 정상이어도 공개 호출은 잘못된 토큰으로 HTTP 401을 받습니다. 호스트 인증과 Access 정책은 그대로 유지합니다.

## 반영 및 확인

1. 같은 검증된 Git 상태의 `src`와 `scripts`를 런타임에 함께 반영합니다. 시작 파일 한 개만 복사하면 새 CGV 모듈·전송 계층·경로 선택 모듈이 누락될 수 있습니다. 상태 디렉터리와 호출 원장은 유지합니다.
2. 기존 운영 절차로 Dtryx 프로세스를 재시작합니다. Worker 설정과 코드를 함께 반영하고, 인증된 `/v1/dtryx/health`와 `/v1/cgv/health`를 확인합니다. 두 응답의 `quota`는 같은 원장을 나타내며 CGV 응답에도 `logging` 상태가 있어야 합니다. 인증값은 환경 또는 비공개 설정에서 읽고 출력하지 않습니다.
3. `/health`의 CGV 설정 진단과 운영 경로 점검 결과를 확인합니다. REST `/api/cgv/theaters`, `/api/cgv/movies?theaterCode=0056`, `/api/cgv/timetable?theaterCode=0056`를 현재 상영일로 호출해 결과를 비교합니다. 위치 검색도 확인하고 영화·시간표의 극장 코드가 선택한 극장과 일치하는지 검증합니다.
4. 실제 MCP의 `cgv_find_theaters`, `cgv_search_movies`, `cgv_get_timetable`과 게시 CLI의 동일 REST 경로를 확인합니다. 예: `daiso cgv-theaters --limit 3 --json`. CLI는 원격 API를 사용하므로 로컬 CLI에 중계 비밀값을 추가하지 않습니다. 시간표는 영화명·극장·상영일·시작 시간·잔여 좌석을 REST 결과와 비교합니다.
5. 한도 오류에서는 REST·MCP 공개 진단의 `quotaReason`·`retryAfter`, REST의 `Retry-After`, 인증된 중계 건강 응답의 `quota.blockedBy`를 확인하고 다음 허용 시점에 재검증합니다. 상태·로그 원장을 삭제해 예산을 초기화하지 않습니다.

복구 코드와 테스트만 준비한 상태에서는 운영 배포·재시작이 완료되었다고 보고하지 않습니다. 실제 반영 뒤 인증된 건강 상태와 REST·MCP·게시 CLI 결과를 다시 검증합니다.
