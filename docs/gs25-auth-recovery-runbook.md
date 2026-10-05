# GS25 직접 인증 복구 운영 절차

검증일: 2026-10-05 KST. 이 문서는 정상 네이버 로그인으로 발급받은 **GS 세션**을 Mac HTTP 중계에서 사용한 복구 절차다. 다음 에이전트는 이 문서부터 읽는다. 2026-03의 무인증 리플레이·Frida 문서는 당시 조사 기록이며 현재 운영 복구 절차가 아니다.

## 완료된 구조와 근거

```text
사용자 정상 네이버 로그인 → GS 웹 허브 → GS authReturn(access/refresh)
                                                ↓ 로컬 비공개 파일
REST / MCP / CLI → Worker → Access/Tunnel → Mac 편의점 중계
                                                ↓ Bearer + appinfo
                             GS BFF store/stock / tokenReissue
```

재고 요청에는 Android·브라우저가 필요 없다. Mac 중계와 Tunnel은 계속 필요하다. 공개 상품 검색과 로그인 세션이 필요한 재고 조회는 서로 다른 경로다. Google Geocoding·Zyte를 켜서 복구하지 않았다.

- [PR #221](https://github.com/hmmhmmhm/daiso-mcp/pull/221): 동일 진행 조회를 공유해 원본·예산 소비 1회로 병합.
- [PR #222](https://github.com/hmmhmmhm/daiso-mcp/pull/222): GS 세션 인증·자동 갱신·로컬 저장.
- [PR #223](https://github.com/hmmhmmhm/daiso-mcp/pull/223): 정확한 상품명 우선 선택. 일반 콜라 검색이 제로콜라 재고로 바뀌던 오류 수정.
- 검증 코드: `0288195fdd8b621e3fc54f11bf945160969401d1`. 당시 Worker: `bcccd325-4a2e-49b6-a1a7-6d34f9a8cf7a`. 다음 복구에서는 **새 배포 SHA와 버전**을 기록한다.
- 공식 우리동네GS 5.3.61/build 2132, Android 14 헤더 기준. 앱의 `getStoreEnhanced`와 공유 `onRequest`, `grmHub/authTicket`, `authReturn`, `auth/tokenReissue`를 오프라인 정적 분석해 정상 계약을 확인했다. 루팅·후킹·인증 우회를 복구에 사용하지 않았다.
- 정확한 `코카콜라캔350ML` 코드 `8801094017200`: 강남프리미엄 16, 강남본 7, 강남타운 10, 서초프라자 0으로 공식 앱 화면과 대조했다. 수량은 **당시 증거**이며 다음 복구의 고정 기대값이 아니다.
- GS 원본 stock HTTP 200, 약 215~357ms; 정상 갱신 HTTP 200/`0000`. 가상기기와 로그인 브라우저를 종료한 뒤 운영 REST·MCP·공개 npm CLI 1.2.9 모두 성공했다. 전체 2,388개 테스트, coverage 네 항목 100%, check/build 및 GitHub CI/Coverage/CodeQL/Deploy 성공.

## 1. 먼저 장애 종류를 구분한다

운영 요청 전에 저장소 `AGENTS.md`, [편의점 중계](convenience-relay.md), [관측 가이드](relay-observability.md)를 읽는다. 현재 main/배포 SHA, 작업트리 변경, 중계 health 및 비밀값을 제외한 로그를 확인한다. 공개 `/health`의 설정 여부만으로 실재고 성공을 판단하지 않는다.

| 관측 | 다음 확인 |
| --- | --- |
| 상품 검색 200, 재고 401/403 | GS 세션·만료·권한·갱신 실패. 상품 검색 성공은 재고 인증 성공이 아니다. |
| 중계 `stage: quota`, 429 | `quota.blockedBy`, `retryAfter`, `resetAt` 확인 후 해당 시각까지 기다린다. 인증을 다시 발급하거나 한도를 올리지 않는다. |
| 원본 `stage: upstream`, 429 | GS 측 제한이다. 자체 원장 429와 구분한다. |
| 502/504 | 원본 상태, JSON 계약, Tunnel/Access, 조회/갱신 기한을 분리한다. |
| Worker 500 또는 MCP `isError` | 중계 로그와 diagnostics의 원본 상태를 본다. REST의 바깥 500만 보고 인증 장애로 단정하지 않는다. |
| 공개 주소에서 Python 기본 UA만 403 | 실제 CLI/SDK와 같은 요청으로 대조한다. 당시 `daiso-cli/1.2.9` UA는 200이었다. 차단 기준을 추측해 우회하지 않는다. |
| 200인데 다른 상품/지역 | 상품 코드·상품명·좌표·필터·수량을 검증한다. HTTP 200만으로 복구 완료가 아니다. |

30/분·3,000/일은 편의점 중계의 **합산 자체 상한**이다. 동시 원본 4, 접수 32, 전체 15초, 재고 캐시 30초를 유지한다. CU/Seven의 운영 트래픽도 같은 편의점 원장을 소비한다. 캐시 적중·동일 진행 조회 병합은 원본 소비가 없거나 1회지만 서로 다른 조건은 각각 소비한다. 인증 갱신은 별도 인증 요청이다.

## 2. 기존 세션을 먼저 점검한다

현재 설치는 아래 경로를 사용한다. 다른 호스트에서는 실제 LaunchAgent·환경 파일을 찾아 경로를 바꾼다.

| 항목 | 현재 Mac 위치 |
| --- | --- |
| 실행 서비스 | `gui/501/page.aka.daiso-dtryx` (UID는 `id -u`로 확인) |
| LaunchAgent | `~/Library/LaunchAgents/page.aka.daiso-dtryx.plist` |
| 런타임 | `~/Library/Application Support/DaisoRelay/dtryx-runtime` |
| 환경 파일 | 같은 기본 디렉터리의 `dtryx.env` |
| GS 세션 | 같은 기본 디렉터리의 `gs25-auth.json` |
| 편의점 원장/로그 | `convenience-state/quota.json`, `convenience-state/logs/` |
| Dtryx 원장/로그 | `dtryx-state/` — 별도 유지 |
| 로컬 health | `http://127.0.0.1:4320/v1/convenience/health`, `/v1/dtryx/health` |

`GS25_AUTH_SESSION_FILE`은 **Mac 환경 변수**다. Worker secret으로 넣지 않는다. 세션은 현재 실행 사용자 소유의 일반 파일, 최대 16 KiB, 권한 0600이어야 한다. 내용은 `accessToken`, `refreshToken`, `deviceId` 세 필드다. 두 토큰은 `Bearer ` 접두사를 제거한 GS JWT다. `deviceId`는 티켓 발급 때 쓴 값을 유지한다.

로컬 health는 다음처럼 환경 파일을 프로세스 내부에서 읽는다. 토큰을 shell 인자나 터미널에 출력하지 않는다. 현재 Node 24 실행 파일로 실행한다.

```bash
relay_dir="$HOME/Library/Application Support/DaisoRelay"
node --env-file="$relay_dir/dtryx.env" --input-type=module <<'JS'
for (const [service, variable] of [
  ['convenience', 'CONVENIENCE_RELAY_TOKEN'], ['dtryx', 'DTRYX_RELAY_TOKEN'],
]) {
  const response = await fetch(`http://127.0.0.1:4320/v1/${service}/health`, {
    headers: { Authorization: `Bearer ${process.env[variable]}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`${service} health HTTP ${response.status}`);
  const { status, active, outstanding, queued, quota } = await response.json();
  console.log(JSON.stringify({ service, status, active, outstanding, queued, quota }));
}
JS
```

JWT의 `exp`만 로컬에서 검사하고 토큰 자체·URL query·JWT 전체 claim을 출력하지 않는다. 당시 access는 약 24시간, refresh는 약 90일이었지만 고정값으로 가정하지 않는다. JWT 형식/exp 점검은 서명 검증이 아니며 서버의 정상 응답으로 유효성을 확인한다.

세션 전송기는 파일을 메모리에 읽고, access 만료 1분 전 또는 stock 401/403에 정상 갱신·재시도를 수행한다. 동시 갱신은 한 번 공유한다. 갱신한 두 토큰을 같은 디렉터리의 0600 임시 파일에 쓴 뒤 원자 교체한다. 갱신 자체 10초 기한은 응답 파싱과 저장까지 포함한다. refresh 만료·철회·저장 실패·재시도 인증 거절 시 실패를 유지한다. **파일만 바꿔도 기존 프로세스의 메모리 세션이 바뀌지는 않는다. 정상 재로그인 후 파일 교체와 중계 재기동이 둘 다 필요하다.**

구현: [gs25-session.ts](../scripts/relay/gs25-session.ts), [dtryx-start.ts](../scripts/relay/dtryx-start.ts), [convenience.ts](../scripts/relay/convenience.ts). 세션이 설정되면 `GS25_API_KEY`로 자동 폴백하지 않는다. 키만 바꾸는 것은 이번 복구 방법이 아니다.

## 3. 만료·철회 시 정상 네이버 로그인으로 GS 세션을 다시 발급한다

사용자의 로그인·추가 인증은 사용자가 직접 완료한다. 새 티켓을 발급하고 격리된 headed 브라우저에서 정상 흐름을 진행한다. 비밀번호·네이버 쿠키·개인정보를 저장소나 도구 출력에 남기지 않는다.

### 3.1 티켓과 GS 채널 초기화

1. 작업용 비공개 디렉터리(0700), 격리 Chrome profile(0700), 고정 browser session 이름을 만든다. [로그인 참조 절차](gs25-auth-recovery-reference.md)의 시작 코드를 로컬 파일로 저장해 실행한다. 코드는 앱 헤더와 빈 JSON으로 `POST https://b2c-bff.woodongs.com/api/bff/v4/grmHub/authTicket`를 호출하고 `resultCode: "0000"` 및 `ticket`을 검증한다.
2. 서버가 출력한 **루프백 시작 주소**를 같은 browser session의 headed Chrome으로 연다. 주소는 비공개 티켓이 든 GS URL로 리다이렉트한다. 시작 서버는 10분 후 종료된다. 만료되면 새 서버·티켓으로 다시 시작한다.
3. 처음 GS bridge에서 채널이 초기화된 뒤 아래 **SPA 이동**을 수행한다. full reload로 `/bridge/naver`를 직접 열면 GS SHOP 채널로 바뀔 수 있다.

```javascript
await document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/bizmgt/signin/bridge/naver');
```

4. 네이버 공식 화면에 **‘우리동네GS 로그인 중’**이 표시되는지 확인한다. GS SHOP이라면 진행하지 말고 초기 bridge부터 새 티켓으로 다시 시작한다.

브라우저 CLI 예시(실제 시작 주소는 코드 출력 사용):

```bash
agent-browser --session gs25-native-auth --profile /absolute/private/profile --headed open http://127.0.0.1:PORT/start
```

CLI 결과에 GS 티켓 URL이 포함될 수 있으므로 stdout/stderr를 비공개로 캡처해 URL query를 출력하지 않는다. 사용자 화면을 확인할 때도 callback URL·회원정보가 도구 로그에 노출되지 않게 한다.

### 3.2 ‘닫기’만 나타났을 때 정상 GS 코드 교환 완료

당시 최초 bridge의 네이버 SDK 호출 전제 때문에 일반 브라우저에서는 ‘네이버 통신 장애’가 발생했다. 게시된 `/bizmgt/signin/bridge/naver` OAuth 라우트를 사용하면 정상 네이버 로그인에 도달했다. 로그인 후 허브 callback의 `code`/`state`는 네이버 승인 코드이며 **GS 재고 토큰이 아니다**.

callback에 ‘닫기’만 나타나는 것은 native 부모에 결과를 전달하려는 앱 흐름이었다. 당시 공식 GS 웹의 로그인 모듈로 정상 교환을 완료했다. 아래는 **2026-10-05에 실제 성공한 호출**이다. 모듈 해시/내보내기 이름은 배포마다 바뀔 수 있다.

```javascript
const params = new URLSearchParams(location.search);
const vue = document.querySelector('#__nuxt').__vue_app__;
const nuxt = vue.config.globalProperties.$nuxt;
const mod = await import('/_nuxt/login.BDscyujx.js');
const api = nuxt.runWithContext(() => mod.u());
await nuxt.runWithContext(() => api.loginNaver({
  code: params.get('code'), state: params.get('state'),
}));
```

이 호출은 공식 `POST /api/hub/bridge/v2/login/naver`로 승인 코드를 교환하고 GS `authReturn`으로 정상 리다이렉트한다. `code`/`state`를 출력하거나 재사용하지 않는다. 만료/이미 사용된 코드면 새 티켓부터 다시 로그인한다.

모듈을 못 찾거나 함수가 달라졌으면 현재 페이지가 로드한 공식 번들에서 `loginNaver`와 해당 endpoint를 확인한다. 당시 로드된 `index.luRNdsfE.js`, `login.BDscyujx.js`는 발견의 단서이지 영구 API가 아니다. 네이버 client ID·채널·redirect·scope를 임의 수정하지 않는다. 현재 공식 흐름을 확인하지 못하면 성공을 주장하지 말고 정확한 중단 지점을 남긴다.

### 3.3 반환 주소를 비공개로 읽고 세션만 저장

최종 주소의 origin은 `https://b2c-bff.woodongs.com`, path는 `/api/bff/v4/grmHub/authReturn`이어야 한다. query의 `result=Y`, `resultCode=0000`, 비어 있지 않은 `token`/`refresh`를 검증한다. 네이버 callback이나 GS SHOP 반환을 GS 성공으로 오인하지 않는다.

[참조 절차](gs25-auth-recovery-reference.md)의 저장 코드는 `agent-browser get url` stdout을 메모리에서 파싱해 URL을 출력하지 않고, 티켓의 `deviceId`와 GS 두 토큰만 0600 새 파일에 저장한다. 실패하면 성공 주소를 추측하지 않는다. capture 파일이 이미 있으면 삭제 덮어쓰기 대신 별도 새 작업 디렉터리를 사용한다.

## 4. 재고·갱신을 검증한 뒤 운영 파일을 교체한다

가능하면 새 비공개 세션을 사용한 로컬 테스트 중계에서 먼저 원본 재고와 정상 갱신을 한 번 확인한다. `createGs25SessionTransport`에 연결하고 기존 중계 handler를 그대로 사용하면 앱 헤더·Bearer 구성을 중복 작성하지 않는다. 실제 운영 예산을 초기화하지 않는다. refresh를 수동 검증했다면 **응답의 회전된 access/refresh를 둘 다 새 파일에 저장한 뒤** 그 파일을 배포한다. 옛 refresh를 배포하지 않는다.

정상 인증 갱신 계약은 `POST https://b2c-bff.woodongs.com/api/bff/v4/auth/tokenReissue`, `Refresh: <GS refresh JWT>`, 같은 appinfo 헤더, 본문 없음이다. 성공은 HTTP 200 + `resultCode: "0000"` + `data.access`/`data.refresh`다. 응답에는 회원 개인정보가 포함될 수 있어 전체 body를 출력·보관하지 않고 필요한 두 필드만 추출한다.

1. 현재 중계 health에서 `active/outstanding/queued`가 모두 0인지 확인한다. 편의점과 Dtryx를 함께 재기동하므로 두 서비스를 확인한다. 기존 runtime SHA, 설정, quota 잔여량을 기록한다. health는 순간 관측일 뿐이며 caller가 취소돼도 공유 토큰 갱신이 계속될 수 있다.
2. **파일 교체 전에** 정상 SIGTERM을 보내고 기존 프로세스가 완전히 종료된 것을 PID와 로컬 포트로 확인한다. 살아 있는 프로세스는 메모리의 옛 세션으로 자동 갱신해 새 세션 파일을 덮어쓸 수 있다. 이 프로세스가 종료될 때까지 세션/env/runtime을 교체하지 않는다.

```bash
launchctl kill SIGTERM gui/$(id -u)/page.aka.daiso-dtryx
# launchctl print / 로컬 포트로 기존 프로세스의 완전 종료를 확인한다.
# 아래 설치·검증을 마칠 때까지 kickstart하지 않는다.
```

3. 종료된 상태에서 비공개 백업 디렉터리(0700)에 변경할 runtime 파일·`dtryx.env`·기존 GS 세션을 백업한다. 환경/세션 백업도 0600으로 유지한다. `quota.json`과 상태 디렉터리를 삭제·교체하지 않는다.
4. 세션을 목적 디렉터리의 **새 0600 임시 파일**로 쓴 뒤 `os.replace`/rename으로 `gs25-auth.json`에 교체한다. 내용은 세 필드만 저장한다. 그룹/다른 사용자 권한이 열린 파일은 중계가 거절한다.
5. `dtryx.env`의 `GS25_AUTH_SESSION_FILE`을 절대 경로로 설정한다. 공백이 있는 값은 따옴표로 감싼다. 환경 파일도 0600·원자 교체하고 나머지 변수는 보존한다. 세션 재발급만 필요하면 runtime·Worker는 다시 배포할 필요가 없다.
6. 코드를 바꾼 경우에만 검증된 커밋의 runtime을 설치한다. #222 최초 설치는 `convenience.ts`, `dtryx-start.ts`, 새 `gs25-session.ts`를 반영했다. 의존 파일이 추가로 바뀌면 변경 목록 전체를 대조한다. #223 상품 선택은 Worker 코드라 Mac 파일 추가 교체가 없었다.
7. 설치한 파일·권한·환경 설정을 확인한 뒤 kickstart한다. 당시 SIGTERM 직후 kickstart는 종료 중 프로세스와 경합해 서비스가 멈췄다. KeepAlive `SuccessfulExit: false`는 정상 종료(code 0)를 자동 재시작하지 않는다.

```bash
launchctl kickstart gui/$(id -u)/page.aka.daiso-dtryx
```

8. 두 인증된 로컬 health가 200인지, PID가 새로 생겼는지, 예산 원장이 유지됐는지 확인한다. 요청 중이면 SIGKILL로 강제 재기동하지 않는다.
9. 새 인증이 실패하면 **현재 프로세스에 SIGTERM을 보내 완전히 종료된 것을 확인한 뒤** 백업한 설정/runtime/세션 파일을 복원하고 설치 권한을 확인해 kickstart한다. 인증 철회된 옛 세션은 rollback해도 살아나지 않는다. 그 경우 정상 재로그인이 필요하며 오류를 품절 0으로 바꾸지 않는다. quota는 rollback 대상이 아니다.

Worker 코드를 바꾸었다면 check/coverage/build·리뷰·CI를 통과한 PR을 병합하고 **동일 main SHA**의 Deploy 완료와 Worker version ID를 확인한다. `gh run list`의 과거 Health Checks 실패와 최신 배포 실패를 혼동하지 않는다. CLI 코드/계약이 그대로면 npm 재출시는 필요 없다.

## 5. 운영 완료 판정

아래 순서대로 실행해 결과와 시각을 남긴다. 예산이 부족하면 `Retry-After`에 따른 다음 분/일에 재시도한다. 테스트용 한도 상향이나 원장 초기화는 하지 않는다.

1. 정확한 상품 코드로 REST 재고 조회. `itemCode=8801094017200`, `storeKeyword=강남`, `lat=37.4981`, `lng=127.0276`, `storeLimit=10`.
2. **상품명으로도** 같은 REST 조회. `keyword=코카콜라캔350ML`만 주고 코드 자동 선택이 일반 콜라인지 확인한다. GS 검색 첫 결과는 제로콜라일 수 있다. 전체 이름 정확 일치→축약 이름 정확 일치→기존 첫 유효 코드의 선택 순서가 두 경로에 적용돼야 한다.
3. `https://mcp.aka.page/mcp`에 SDK Client + StreamableHTTPClientTransport로 연결해 `gs25_check_inventory` 호출. 인자는 `keyword`, `storeKeyword`, `latitude`, `longitude`, `storeLimit`; 코드 지정 대조 시 `itemCode`도 준다. MCP는 코드가 있어도 `keyword`가 필수다. `isError`가 false이고 text/structuredContent의 상품·매장·수량이 정상인지 확인한다.
4. **실제 게시된 npm 버전**의 CLI로 상품명 조회. 로컬 build만 실행하고 배포 CLI 검증이라고 기록하지 않는다. 저장소 자체 package 이름도 `daiso`여서 `npm exec --package daiso@1.2.9`가 로컬 package와 충돌했던 사례가 있다. 필요하면 별도 작업 디렉터리에서 registry tarball을 받아 해당 `dist/bin.js`로 검증한다.

```bash
daiso gs25-inventory 코카콜라캔350ML --storeKeyword 강남 --lat 37.4981 --lng 127.0276 --storeLimit 10 --json
daiso get /api/gs25/inventory --itemCode 8801094017200 --storeKeyword 강남 --lat 37.4981 --lng 127.0276 --storeLimit 10 --json
```

5. 비교는 동일 상품·위치·시점의 앱과 수행한다. 원본 수량이 정수·음수가 아닌지, 실제 점포명이 지역에 맞는지 본다. 캐시 30초와 실시간 변동을 고려한다. 모든 0도 가능하므로 0만으로 실패를 판정하거나 임의 양수로 보정하지 않는다.
6. 자신이 시작한 로그인 브라우저와 가상기기만 종료한다. 당시 emulator-5560의 세션 전용 서비스 `page.aka.daiso-gs25-poc`를 bootout하고 `adb devices`에서 없어졌음을 확인했다. AVD·사용자 로그인 데이터를 삭제하지 않는다. 다른 기기·올리브영 브라우저를 종료하지 않는다. **종료 후 REST/MCP/CLI를 다시 성공시켜야** 가상기기 없는 조회로 완료 판정한다.
7. 함께 사용하는 CU·Seven·Dtryx 및 OY를 소량 smoke한다. Seven `stockAvailable: false`, 수량 -1은 미확인이지 재고 0이 아니다. 당시 CU 200/available true, Seven 200/수량 미확인, Dtryx movies 200, OY 실제 재고 200을 확인했다.

올리브영은 별도 서비스/브라우저다. 이번 점검에서 GS 브라우저 종료 **이전**부터 존재하던 OY 종료 실패·stale owner marker를 발견했다. 소유 guard PID, browser PID/PGID, 전용 crashpad 프로세스가 **모두 없다는 확인 후** marker를 백업하고 별도 OY 중계를 재기동해 복구했다. 추측으로 marker를 지우거나 다른 Chrome을 종료하지 않는다. [OY 운영 절차](oliveyoung-free-relay.md)와 소유권 코드를 먼저 확인한다.

## 6. 다음 에이전트에게 남길 기록

- 변경 PR·커밋 SHA·Worker version·설치 runtime SHA 및 백업 위치.
- 토큰 값을 제외한 재로그인/갱신 성공 여부, 세션 파일 소유자·권한 검사 결과.
- 재기동 전후 두 health·quota 잔여량, 오류 단계와 재시도 시각.
- 상품 코드·이름·위치·매장별 수량·캐시 조건, 앱 대조 시각.
- REST/MCP/**게시 CLI** 증거, 가상기기 종료 확인, 다른 서비스의 성공/미확인 구분.
- 실패한 접근과 버전 의존 모듈 변경 여부. 성공하지 못한 부분을 명확히 남긴다.

2026-10-05의 로컬 증거는 개인 workspace의 `scratch/gs25-device-free-2026-10-05/`에 있다. `gs25-direct-auth-final.json`, `gs25-session-deploy.json`, `session-relay-verified.json`, `gs25-keyword-fixed-rest.json`, `gs25-keyword-operating-mcp.json`, `gs25-keyword-fixed-cli.json`, `oy-auth-validation-recovery.json` 및 check/coverage/build 로그가 공개 결과 증거다. 이 경로는 다른 머신에 없을 수 있으므로 이 운영 문서는 해당 scratch 파일에 의존하지 않는다. GS 세션·callback URL·회원 응답은 Git에 올리지 않는다. 개인 `PROJECT.md`에도 최신 Facts와 Action log를 갱신한다.
