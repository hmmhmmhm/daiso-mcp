# 올리브영 무료 브라우저 릴레이

## 2026-09-21 Windows 로컬 검증

Windows 11의 설치된 Chrome을 별도 임시 컨텍스트로 실행하여 기존 `createBrowserRunner`와 `createOliveyoungRelay`를 검증했습니다. 개인 프로필·로그인 정보는 사용하지 않았습니다. Node 클라이언트가 `127.0.0.1`의 임시 포트에 생성한 인증 릴레이를 거쳐 브라우저에서 조회하는 전체 경로를 확인했습니다.

- 상품 검색: 선크림 399개, 상품 번호 `A000000263510`.
- 매장 검색: 강남 기준 50개.
- 상품 상세에서 실제 `masterGoodsNumber`를 구한 뒤 매장별 재고 조회: `checkedCount: 1`, `stockSource: nearby_store`.
- 매장별 재고: 50개 중 재고 있음 47개. 수량은 조회 시점 값입니다.
- 실행 종료 시 임시 HTTP 서버와 소유한 브라우저를 닫았습니다. 인증 토큰은 메모리에서 생성했으며 출력하거나 저장하지 않았습니다.

이 검증은 Windows에서도 브라우저 조회와 로컬 HTTP 릴레이를 시험할 수 있음을 보여 줍니다. 기존 `start.ts`의 상시 프로세스 감시와 설치 도구는 POSIX/macOS용이므로 Windows 상시 운영 지원을 의미하지 않습니다. 공개 Worker에서 이 PC로 연결되는 터널이나 자동 실행은 구성하지 않았습니다.

2026-09-15 검증: 이 Mac의 일반 HTTP 요청은 올리브영 검색 API에서 HTTP 403 보안 검증 HTML을 받았습니다. 개인 프로필과 분리한 **화면 있는 Chromium**에서는 네 API 모두 HTTP 200, `status: SUCCESS`였습니다. 새 headless 브라우저는 보안 검증 화면에 머물렀습니다. 이 브라우저 릴레이를 사용하려면 GUI 로그인 세션, 브라우저, 전원과 네트워크를 유지할 수 있는 운영 호스트가 필요합니다. 설정만 추가했다고 복구된 것으로 판단하면 안 됩니다.

2026-09-21 Cloudflare 원격 프리뷰에서는 직접 요청의 런타임 오류를 수정하고 고정 브라우저 헤더를 추가해 상품·매장 조회의 실제 성공을 확인했습니다. 다만 같은 요청에서도 HTTP 403이 간헐적으로 발생하고 상품 상세 재고 API는 계속 실패했습니다. 상세 매장 재고까지 복구되었거나 릴레이 호스트가 더 이상 필요하지 않다고 판단하지 않습니다. 설정된 릴레이는 계속 우선 사용합니다.

Workers가 지원하지 않는 `redirect: 'error'` 대신 `manual`을 사용하며, HTTP 200만 허용하는 검사로 리다이렉트를 거절합니다. 토큰을 다른 주소로 따라 보내지 않습니다. User-Agent·Origin·Referer·Accept-Language는 공식 API 직접 요청에만 고정값으로 추가하며 릴레이에는 전달하지 않습니다. [조사 및 실제 검증 기록](superpowers/plans/2026-09-21-oliveyoung-recovery.md)을 참고하세요.

## 실행

저장소의 개발 의존성을 설치한 뒤 실행합니다. Playwright Chromium이 없다면 `npx playwright install chromium`으로 설치하거나, 이미 설치한 Chromium 실행 파일의 절대 경로를 `OY_BROWSER_EXECUTABLE`에 지정합니다.

```sh
# 토큰은 별도 비밀 저장소/환경에서 주입합니다. 로그나 저장소에 기록하지 않습니다.
export OY_RELAY_TOKEN='<전용 임의 토큰>'
# 선택 사항: 기본 포트 4319, Playwright 기본 Chromium 사용
export OY_RELAY_PORT=4319
# export OY_BROWSER_EXECUTABLE='/absolute/path/to/chromium'
npx tsx scripts/relay/start.ts
```

서버는 `127.0.0.1`에만 바인딩합니다. 홈페이지의 정상 `/store/` 페이지가 열린 뒤 준비 메시지를 출력합니다. 브라우저와 서버는 SIGINT/SIGTERM으로 종료합니다. 화면 없는 서버에서는 현재 검증 결과대로 작동하지 않을 수 있습니다. 세션이 보안 검증으로 바뀌면 조회는 실패하며, 운영자가 전용 브라우저 접속을 확인하고 릴레이를 재시작해야 합니다.

Cloudflare Worker에서 쓰려면 승인된 별도 연결 경로가 필요합니다. 이번 구현은 공개 터널, LaunchAgent 또는 상시 실행을 자동 생성하지 않습니다.

## Worker/MCP 설정

- `OY_RELAY_URL`: 운영자가 관리하는 릴레이의 기본 HTTPS 주소. 개발 시 `http://127.0.0.1:4319` 허용.
- `OY_RELAY_TOKEN`: 릴레이와 같은 전용 Bearer 토큰.

이 값은 Worker 바인딩에서 REST 핸들러와 MCP 서비스로 전달됩니다. MCP 도구 사용자 인자로 설정할 수 없습니다. 릴레이가 설정되어 있으면 먼저 릴레이를 호출하고, 없으면 공식 API에 직접 요청합니다. 직접 요청 실패 시 운영자에게 릴레이 설정 안내를 반환합니다. 어느 경로도 Zyte를 호출하지 않습니다.

### 설정 진단

`GET /health` 응답의 `config.oliveyoungRelay`는 URL·토큰 값 없이 설정 여부만 보여 줍니다. `urlConfigured`/`tokenConfigured`는 공백을 제외한 값의 존재, `urlValid`는 실제 전송과 같은 URL 검증 결과입니다. HTTPS와 localhost/127.0.0.1의 HTTP만 허용하며 URL 안의 인증 정보·쿼리·프래그먼트는 거부합니다.

`accessClientIdConfigured`/`accessClientSecretConfigured`는 Access 설정 각각의 존재, `accessConfigured`는 두 값의 완전성을 뜻합니다. `accessPairValid`는 둘 다 미지정이거나 둘 다 유효한 값일 때만 참입니다. 빈 문자열을 명시하면 미지정으로 취급하지 않습니다. `configured`는 유효한 URL·토큰·Access 쌍 조건을 모두 만족한다는 뜻이며, 연결 가능 여부나 브라우저 세션의 정상 여부는 보장하지 않습니다. 실제 복구는 fresh health check로 확인합니다.

GitHub Actions의 `Sync Worker Secrets`는 위 네 OY secrets를 동기화하며, 비어 있는 GitHub secret은 기존 Worker 값을 지우지 않고 건너뜁니다.

## 허용 요청

`POST /v1/oliveyoung/{operation}`에 JSON 본문과 `Authorization: Bearer …`를 보냅니다. 대상 호스트는 `https://www.oliveyoung.co.kr`로 고정하며 임의 URL은 받지 않습니다.

| operation             | JSON 필드                                                                            |
| --------------------- | ------------------------------------------------------------------------------------ |
| `find-store`          | `lat`, `lon`, `pageIdx`, `searchWords`, `pogKeys`, `serviceKeys`, `mapLat`, `mapLon` |
| `product-search-v3`   | `includeSoldOut`, `keyword`, `page`, `sort`, `size`                                  |
| `stock-goods-info-v3` | `goodsNo`                                                                            |
| `stock-stores`        | `productId`, `lat`, `lon`, `pageIdx`, `searchWords`, `mapLat`, `mapLon`              |

숫자·문자열·불리언 타입과 필드 목록을 검증합니다. 요청 본문은 최대 16 KiB입니다. 인증 실패는 브라우저 작업 전에 401, 잘못된 경로는 404, 잘못된 본문은 400/413입니다. 한 브라우저 작업만 동시에 실행하며, 실행·대기를 합쳐 8개를 넘으면 503입니다. 취소되었거나 15초 이상 대기한 요청은 실행하지 않습니다. 브라우저 fetch는 본문을 읽을 때까지 15초 제한을 적용합니다. 정상 HTTP 200과 `SUCCESS` JSON만 반환하며, HTML·상태 오류·네트워크 실패는 원문이나 비밀을 노출하지 않는 502가 됩니다.

기존 상품·매장·재고의 실패 시 30분 캐시 재사용 동작은 이 전송 변경에서 확대하지 않았습니다. 캐시 데이터가 실시간 재고를 보장하지는 않습니다.

## 검증 기록

- 직접 Node POST: `find-store`, `product-search-v3` 모두 HTTP 403, 보안 검증 HTML.
- 새로 연 headed Chromium: 별도 로그인과 개인 쿠키 없이 네 API 성공.
- 구현한 서버를 임시 포트 `14319`에 띄워 로컬 HTTP로 검증: 잘못된 토큰 401; `find-store` 200/SUCCESS/9개, `product-search-v3` 200/SUCCESS/382개, `stock-goods-info-v3` 200/SUCCESS, `stock-stores` 200/SUCCESS/9개.
- 실제 smoke는 설치된 Chrome for Testing 148 실행 파일을 `OY_BROWSER_EXECUTABLE`로 지정했습니다. 종료 후 포트 리스너가 남지 않은 것을 확인했습니다.
- 테스트: `npx vitest run tests/relay tests/services/oliveyoung tests/api/oliveyoung-handlers.test.ts tests/app/app-api-oliveyoung.test.ts tests/app/app-api-actions.test.ts`.

공개 Worker에서 이 로컬 Mac으로 연결되는 경로는 이번 smoke로 검증한 범위에 포함되지 않습니다.

## 상시 운영 보강

중계는 한 브라우저·한 컨텍스트·한 페이지를 재사용합니다. 요청마다 탭을 만들지 않습니다. 추가 페이지는 즉시 회수하며 회수 실패·페이지 crash·Node 측 watchdog timeout에는 소유한 브라우저 세션을 폐기합니다. 200회 조회 또는 30분 사용 후 유휴 경계에서 정리하고 다음 요청에 새 세션을 만듭니다.

브라우저는 별도 guard 프로세스가 소유합니다. 중계 부모가 SIGKILL로 종료되어도 IPC 단절을 감지해 회수합니다. PID·생성 시각·프로세스 그룹을 확인한 소유 프로세스만 종료합니다. macOS에서 별도 그룹으로 분리되는 crashpad 보조 프로세스도 실행별 고유 경로로 식별해 메모리 집계와 회수에 포함합니다. 브라우저에는 GUI 실행에 필요한 환경만 전달하고 운영 토큰은 제외합니다. 정상 종료가 지연되면 확인된 그룹을 강제 종료하고 실제 소멸을 확인합니다. 개인 Chrome을 프로세스 이름으로 일괄 종료하지 않습니다. guard까지 강제 종료되거나 소유권 확인이 실패한 경우 소유 마커를 유지하여 재시작을 차단합니다. 이 경우 운영자가 잔존 프로세스를 확인해야 합니다. 소유 확인 없이 마커 파일을 지우면 안 됩니다.

소유 브라우저 프로세스 그룹의 RSS를 30초마다 점검하며 1GiB를 넘으면 회수합니다. 이는 순간적인 메모리 사용까지 막는 OS 하드 제한은 아닙니다. 설치 설정은 Node heap을 256MiB로 제한합니다. 브라우저 응답은 최대 2MiB이며 본문을 스트리밍으로 읽으면서 제한합니다. 인증된 `GET /health`에서 탭 수·호출 수·메모리 관측값과 상태를 확인합니다.

### 전체 호출량과 인증

모든 중계 호출은 전체 분당 30회, UTC 하루 3,000회로 제한합니다. MCP·REST 모두 같은 중계를 거치므로 호출 경로로 우회할 수 없습니다. 원장을 `OY_RELAY_STATE_DIR`에 원자적으로 저장하며 저장 실패·손상은 조회 거절로 처리합니다. 본문 업로드 중인 요청도 최대 8개 슬롯에 포함합니다. 실패한 원본 요청도 이미 소비한 예산을 돌려주지 않습니다.

Cloudflare Access 사용 시 Worker secrets에 `OY_ACCESS_CLIENT_ID`와 `OY_ACCESS_CLIENT_SECRET`을 함께 설정합니다. 기존 `OY_RELAY_TOKEN`과 별개입니다. 사용자 도구 입력으로 전달하거나 덮어쓸 수 없습니다. Access 비밀이 다른 주소로 전달되지 않도록 리다이렉트를 거절합니다. Access 정책은 해당 서비스 토큰만 허용하는 Service Auth로 구성하며, Tunnel은 localhost:4319와 최종 404 경로만 연결합니다. 브라우저 디버깅 주소와 개인 네트워크 경로는 연결하지 않습니다.

### macOS 전용 계정 설치

시스템 설정에서 일반 사용자 계정 `daisorelay`를 만듭니다. 관리자 계정은 설치 스크립트가 거절합니다. 코드와 전용 브라우저는 `/Library/Application Support/DaisoRelay`에 root 소유로 설치하고, 토큰과 상태는 전용 계정 홈에만 둡니다. 자동 로그인은 설정하지 않습니다. 계정 생성과 최초 GUI 로그인은 사용자가 직접 수행해야 합니다.

설치 도구는 기본적으로 변경 없는 계획만 출력합니다. `--apply`는 검토 후 사용자의 관리자 터미널에서 실행합니다. Cloudflare 자격증명 파일은 별도로 준비된 mode 0600 파일을 지정하며 채팅·Git에 복사하지 않습니다.

```sh
/usr/bin/python3 scripts/relay/install-macos.py \
  --browser-app '/absolute/path/Google Chrome for Testing.app' \
  --credentials '/absolute/private/path/cf-private.json'
```

실제 설치는 같은 명령 앞에 `sudo`, 끝에 `--apply`를 붙입니다. root 권한으로 npm 설치나 외부 코드를 다운로드하지 않으며, 사전에 검증한 코드·의존성·브라우저를 복사합니다. 기존 설치가 있으면 자동 덮어쓰지 않고 중단합니다.

두 LaunchAgent는 `daisorelay`의 GUI 로그인 시 시작합니다. 브라우저의 GUI 세션이 필요하므로 부팅만 완료된 로그인 화면에서는 조회를 제공하지 않습니다. 실패 재시작은 최소 60초 간격이며, 중계의 정상 종료는 자동 재시작하지 않습니다. stdout/stderr은 `/dev/null`로 보내므로 디스크 로그가 누적되지 않습니다. 진단은 인증된 health와 launchctl 종료 상태로 확인합니다.

전용 계정의 터미널에서 아래 명령으로 두 작업을 내릴 수 있습니다.

```sh
launchctl bootout "gui/$(id -u)/page.aka.daiso-oliveyoung-tunnel"
launchctl bootout "gui/$(id -u)/page.aka.daiso-oliveyoung"
```

업그레이드는 두 작업을 중지하고 소유 브라우저가 없는 것을 확인한 뒤 수행해야 합니다. 기존 원장은 보존합니다. 전용 계정도 시스템에서 읽기 허용한 파일에는 접근할 수 있으므로, 개인 비밀은 기존 파일 권한으로 보호해야 합니다.

### 2026-09-15 운영 보강 검증

Playwright Chromium 153.0.8010.12에서 sandbox를 켜고 검증했습니다. 실제 조회 두 건과 부모 SIGKILL 후 잔여 소유 프로세스 0개를 확인했습니다. 모의 브라우저 API 조회 400회로 두 번 교체하고 각 교체 후에도 잔여 프로세스 0개를 확인했습니다. 팝업, 실제 renderer crash, 18초 Node watchdog도 검증했습니다. 메모리는 시점별 약 519~632MiB로 관측됐으며 장기간 무누수나 최고 사용량 보장을 의미하지 않습니다.
