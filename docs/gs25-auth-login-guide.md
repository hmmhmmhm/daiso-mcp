# GS25 로그인 가이드: 네이버 로그인에서 GS 토큰 저장까지

개인 계정으로 GS25 재고 조회를 구성하는 개발자를 위한 안내입니다. 네이버 로그인 후 **‘닫기’ 화면에 멈춘 경우에는 4단계**를 먼저 확인하세요. 이 가이드는 GS 공식 웹의 정상 로그인 흐름을 사용합니다.

## 확인된 범위

| 항목                       | 확인 내용                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------- |
| 실제 전체 로그인·재고 조회 | 2026-10-05, macOS + headed Chrome + agent-browser                                     |
| GS 앱 헤더 기준            | 우리동네GS 5.3.61 / build 2132, Android 14                                            |
| 공개 웹 코드 재확인        | 2026-10-06, `login.BDscyujx.js`의 `u` export·`loginNaver`·v2 코드 교환 경로 존재 확인 |
| agent-browser 버전         | 성공 당시 버전은 기록하지 않아 확정할 수 없음. 2026-10-06 로컬 설치 버전은 0.27.0     |
| Windows                    | 로그인·저장·중계 전체 실행은 미검증. 아래 PowerShell 명령은 이식 시 참고할 절차       |

확인한 공식 공개 코드: [로그인 모듈](https://ex-hubpage.grm.gsretail.com/_nuxt/login.BDscyujx.js), [GS 허브 페이지](https://ex-hubpage.grm.gsretail.com/bizmgt/signin/bridge/naver).

10월 6일 확인은 공개 번들의 정적 확인입니다. 새 티켓으로 실제 계정 로그인을 다시 완료한 결과는 아닙니다. 아래 모듈 경로와 export 이름도 GS 배포에 따라 바뀔 수 있습니다.

## 먼저 알아둘 세 가지

1. 네이버 로그인 결과의 `code`/`state`는 일회성 승인 정보입니다. 재고 API에 쓸 GS 토큰이 아닙니다.
2. GS 웹이 승인 정보를 교환하고 **GS `authReturn`으로 이동해야** `token`/`refresh`를 얻습니다.
3. 처음 GS bridge를 연 브라우저 프로필과 GS 탭을 계속 사용하세요. 주소만 다른 브라우저에 복사하거나 `/bridge/naver`로 새로고침하면 초기화된 채널·로그인 상태를 잃을 수 있습니다.

```text
새 GS 티켓 → GS bridge 초기화 → 네이버 로그인
    → GS 허브 callback(code/state, ‘닫기’)
    → 공식 loginNaver로 코드 교환
    → GS authReturn(token/refresh) → 로컬 세션 저장
```

## 1. 비공개 작업 폴더를 만들고 시작 코드를 준비합니다

[참조 코드](gs25-auth-recovery-reference.md)의 `start.py`와 `capture.py`를 **저장소 밖의 새 작업 폴더**에 저장하세요. Python 3.9 이상을 기준으로 합니다. 브라우저는 화면이 보이는 Chrome을 사용하며 계정 입력·추가 인증은 직접 완료합니다.

macOS에서는 폴더를 0700으로 만듭니다. Windows의 `os.open(..., 0o600)`은 NTFS 접근 권한을 설정하는 대체물이 아닙니다. PowerShell에서는 현재 사용자 전용 ACL을 먼저 설정합니다. 사용자 이름과 폴더 경로는 자신의 환경에서 확인하세요.

```powershell
$work = Join-Path $env:LOCALAPPDATA ('Gs25Auth-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $work /inheritance:r /grant:r "$($me):(OI)(CI)F"
if ($LASTEXITCODE -ne 0) { throw '작업 폴더 권한 설정 실패' }
Set-Location $work
# 이 폴더에 start.py와 capture.py를 저장한 다음 실행합니다.
python start.py
```

`start.py`는 새 티켓을 발급하고 `http://127.0.0.1:PORT/start`를 출력합니다. 서버를 실행한 터미널은 열어두세요. 같은 작업 폴더로 두 번 발급하려고 하면 실패합니다. 만료된 티켓은 새 작업 폴더에서 다시 시작합니다.

## 2. GS 초기 bridge를 열고 같은 탭에서 이동합니다

처음부터 `/bizmgt/signin/bridge/naver` 주소를 직접 열지 마세요. 시작 코드가 출력한 **루프백 주소**를 먼저 열어 GS bridge가 티켓과 우리동네GS 채널을 초기화하도록 합니다.

agent-browser를 사용한다면 첫 실행은 다음 형태입니다. 프로필 경로에는 새 작업 폴더 아래의 절대 경로를 사용하세요. 이후 명령도 같은 `--session gs25-native-auth`를 지정합니다. 출력에는 티켓 URL이 포함될 수 있어 비공개 파일로만 저장합니다.

```powershell
$profile = Join-Path $work 'chrome-profile'
# PORT를 start.py가 출력한 실제 포트로 바꿉니다.
agent-browser --session gs25-native-auth --profile $profile --headed open http://127.0.0.1:PORT/start *> (Join-Path $work 'browser.private.log')
```

agent-browser가 대기 문제로 막히면 **처음부터 별도 Chrome 프로필의 일반 브라우저로 진행해도 됩니다**. 이 경우 루프백 주소부터 시작하고, 5단계에서 수동 저장 방식을 사용합니다. 진행 중인 티켓의 주소를 새 프로필로 옮기지는 마세요.

GS 페이지에서 Chrome 개발자 도구(F12)를 열고 Console에 아래 코드를 실행합니다. 네이버 페이지나 다른 프레임이 아니라 **GS 허브의 메인 페이지 컨텍스트**를 선택합니다. 이 방식은 URL 전체를 다시 여는 대신 현재 앱의 라우터로 이동합니다.

```javascript
(async () => {
  if (location.origin !== 'https://ex-hubpage.grm.gsretail.com') {
    console.log('GS 허브 페이지에서 실행하세요.');
    return;
  }
  const router = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$router;
  if (!router) {
    console.log('GS 앱 초기화가 완료됐는지 확인하세요.');
    return;
  }
  await router.push('/bizmgt/signin/bridge/naver');
})();
```

## 3. 네이버 로그인을 완료합니다

최초 GS bridge에서 ‘네이버 통신 장애’ 팝업은 일반 브라우저에 앱용 네이버 SDK가 없는 흐름에서 관찰됐습니다. 팝업 자체만으로 GS 서버 장애나 토큰 발급 실패를 확정하지 마세요. 팝업을 닫은 뒤 2단계의 이동을 진행하고, 네이버 공식 화면에 **‘우리동네GS 로그인 중’**이 표시되는지 확인합니다.

GS SHOP이 표시되면 다른 채널입니다. 새 티켓으로 초기 bridge부터 다시 시작하세요. 우리동네GS 네이버 로그인·추가 인증을 마치고 GS 허브의 `/bizmgt/signin/bridge/naver`로 돌아오면 다음 단계로 진행합니다.

## 4. ‘닫기’ 화면에서 GS 코드 교환을 실행합니다

이 화면의 `code`/`state`를 읽어 **GS 공식 로그인 모듈**에 전달해야 합니다. 과거 참조의 `start.py`와 `capture.py`만 실행하면 이 중간 단계가 수행되지 않습니다. agent-browser 명령이 끝나지 않았다는 것만으로 코드 교환 요청이 전송됐다고 판단해서도 안 됩니다.

다음은 코드 교환을 포함한 최소 브라우저 스크립트입니다. **로그인 직후의 같은 GS 허브 탭**에서 Console로 한 번만 실행하세요. 코드·토큰은 출력하지 않습니다. 현재 확인된 `u` export는 GS 로그인 기능을 반환하는 함수이며, 다른 export를 차례대로 실행해 찾지는 마세요.

```javascript
(async () => {
  if (
    location.origin !== 'https://ex-hubpage.grm.gsretail.com' ||
    location.pathname !== '/bizmgt/signin/bridge/naver'
  ) {
    console.log('네이버 로그인 후 돌아온 GS 허브 탭에서 실행하세요.');
    return;
  }
  const params = new URLSearchParams(location.search);
  const codes = params.getAll('code');
  const states = params.getAll('state');
  if (codes.length !== 1 || states.length !== 1 || !codes[0] || !states[0]) {
    console.log('승인 정보가 없습니다. 새 티켓부터 로그인하세요.');
    return;
  }
  const nuxt = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt;
  if (typeof nuxt?.runWithContext !== 'function') {
    console.log('GS 앱 컨텍스트를 찾지 못했습니다. 원래 GS 탭인지 확인하세요.');
    return;
  }
  // 2026-10-06 공개 번들 확인값. 변경됐으면 아래 탐색 절차를 따릅니다.
  const modulePath = '/_nuxt/login.BDscyujx.js';
  const exportName = 'u';
  try {
    const mod = await import(modulePath);
    if (typeof mod[exportName] !== 'function') {
      console.log('로그인 export가 변경됐습니다. 현재 번들을 확인하세요.');
      return;
    }
    const api = nuxt.runWithContext(() => mod[exportName]());
    if (typeof api?.loginNaver !== 'function') {
      console.log('공식 loginNaver 함수를 찾지 못했습니다.');
      return;
    }
    const result = await nuxt.runWithContext(() =>
      api.loginNaver({
        code: codes[0],
        state: states[0],
      }),
    );
    console.log(
      result === 'ERROR'
        ? '교환 실패. Network에서 상태 코드만 확인하세요.'
        : '교환 호출 완료. GS 반환 주소 또는 추가 가입 안내를 확인하세요.',
    );
  } catch {
    console.log('교환을 완료하지 못했습니다. 현재 번들·앱 컨텍스트를 확인하세요.');
  }
})();
```

`runWithContext`는 현재 Nuxt 앱의 로그인 기능을 사용하는 데 필요합니다. 그 기능이 초기 bridge의 GS 채널 정보와 반환 정보를 함께 사용하므로 `code/state`만 Python의 새 HTTP 세션에 보내는 것과 같지 않습니다. 원본 코드가 사용하는 쿠키·앱 상태를 유지해야 합니다. 성공 당시에도 같은 프로필·GS 앱 탭·Nuxt 컨텍스트를 유지했습니다. 어떤 개별 쿠키가 필수인지는 별도로 분리 검증하지 않았습니다.

### 요청이 실제 실행됐는지 확인하는 방법

개발자 도구의 **Network** 탭을 열고 `login/naver`로 필터링합니다. 로그인 반환에 따른 이동을 확인하려면 Preserve log를 켜되, 확인 뒤 민감한 기록을 삭제하고 HAR를 공유하지 마세요.

- 기대 요청: `POST /api/hub/bridge/v2/login/naver`.
- 요청이 없다면 스크립트 실행·모듈 import·Nuxt 컨텍스트·잘못된 탭을 확인합니다.
- 요청이 있어도 HTTP 200만으로 성공은 아닙니다. GS 반환 주소 또는 추가 가입/동의 흐름을 확인합니다.
- 최종 성공 주소: `https://b2c-bff.woodongs.com/api/bff/v4/grmHub/authReturn`. `result=Y`, `resultCode=0000`, 비어 있지 않은 `token`·`refresh`가 있어야 합니다.
- 승인 정보가 만료됐거나 이미 사용됐다면 같은 코드로 반복 호출하지 말고 새 티켓부터 시작합니다.

GS 공식 모듈 자체가 실패 내용을 Console에 기록할 수 있습니다. 콘솔·Network의 본문·전체 URL을 외부에 보내지 마세요. 위 스크립트의 ‘호출 완료’ 메시지도 토큰 발급 성공 판정을 대신하지 않습니다.

### 모듈 경로나 export가 바뀌었을 때

1. **현재 GS 허브 탭**의 DevTools → Sources에서 전체 검색(Ctrl+Shift+F, Mac은 Cmd+Option+F)을 엽니다.
2. `loginNaver` 또는 `/api/hub/bridge/v2/login/naver`를 검색합니다. 비슷한 `/api/hub/bridge/login/naver`는 다른 경로이므로 혼동하지 마세요.
3. 검색된 파일의 실제 `/_nuxt/…js` URL을 확인합니다. 압축되어 있으면 `{}` 버튼으로 보기 좋게 정렬합니다.
4. `loginNaver`를 반환하는 함수와 파일 끝 export를 연결합니다. 10월 6일에는 함수 `Z`가 `export { … Z as u }`로 노출됐습니다. 글자 `Z`·`u`는 고정 계약이 아닙니다.
5. 필요하면 Network의 JS 필터에서 해당 파일 또는 이를 import하는 모듈을 찾아 검색합니다. Console에서 **검증한 단일 모듈만** import한 뒤 `Object.keys(mod)`로 export 이름을 볼 수 있지만, 이름 목록만으로 어느 함수인지 판정할 수는 없습니다.
6. 확인한 값만 위 스크립트의 `modulePath`·`exportName`에 반영합니다. 네이버 client ID·redirect·scope·GS 채널을 임의 변경하지 않습니다.

Sources에 lazy-loaded 모듈이 없다면 Network에서 현재 페이지의 `modulepreload`·import 관계를 확인해 공개 JS를 읽으세요. 10월 6일 공개 페이지는 `/_nuxt/login.BDscyujx.js`를 참조했습니다. 무작위 export 실행이나 임의 API 본문 조합으로 교환을 추측하지 마세요.

## 5. 반환 주소를 출력하지 않고 세션을 저장합니다

[참조 코드의 capture.py](gs25-auth-recovery-reference.md#3-gs-authreturn만-비공개-파일로-저장)를 실행합니다.

- agent-browser를 썼다면 같은 session에서 `python capture.py`를 실행합니다.
- 일반 Chrome으로 진행했다면 `python capture.py --manual`을 실행하고, **본인 터미널의 숨김 입력**에 최종 GS 반환 주소를 붙여 넣습니다. 주소를 셸 명령 인자나 채팅에 넣지 마세요. 입력 문자가 숨겨지지 않는다는 경고가 나오면 중단합니다. 사용 후 클립보드를 비웁니다.

생성 파일은 `session.private.json`이며 `accessToken`, `refreshToken`, `deviceId` 세 필드만 담습니다. `capture.py`는 주소·성공 플래그·JWT 형태·만료를 검사하지만 서명을 검증하지는 않습니다. 실제 재고·갱신 성공은 다음 단계에서 확인합니다.

Windows에서 agent-browser 호출이 멈추면 `Get-Command agent-browser`, `agent-browser --version`, `agent-browser --help`부터 확인하세요. 별도 Python 도구가 npm `.cmd` shim을 실행하는 문제인지, 브라우저 시작 문제인지, 다른 session 문제인지 구분합니다. capture 예제의 subprocess는 15초에 중단하며 시간 초과를 로그인 성공으로 취급하지 않습니다. cmd/shim 실행을 억지로 바꾸기 전에 일반 Chrome + 수동 저장 경로로 로그인 단계와 도구 문제를 분리할 수 있습니다.

## 6. 서버에서 사용합니다

GS 토큰을 개인 사이트의 브라우저 JavaScript·공개 저장소에 넣지 마세요. 재고 API는 서버에서 호출합니다. GS `deviceId`는 티켓 발급 때 사용한 값을 유지하고, access 만료·401/403 때 정상 refresh 흐름을 사용합니다.

이 저장소 중계를 사용하는 경우 [운영 절차 4절](gs25-auth-recovery-runbook.md#4-재고갱신을-검증한-뒤-운영-파일을-교체한다)로 이어가세요. 현재 구현은 파일 소유자·0600 권한을 검사하는 POSIX/Mac 운영 기준입니다. Windows에서는 이 검사를 NTFS ACL에 맞춰 구현·검증해야 하므로, 로그인 예제를 실행했다고 중계 전체가 Windows에서 지원된다고 볼 수 없습니다. `launchctl` 명령도 Mac 전용입니다.

## 질문별 답변

| 질문                             | 답변                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 지금도 같은 loginNaver를 쓰나요? | 실제 성공은 10월 5일입니다. 10월 6일 공개 번들에서도 같은 모듈·u export·v2 경로를 확인했습니다. 매번 필요한 로그인 단계이며 재고 조회마다 실행하지 않습니다. 새 계정 로그인 전체 재검증 결과는 아닙니다. |
| 최소 재현 스크립트가 있나요?     | 참조의 start.py → 이 가이드 2·4단계 브라우저 스크립트 → capture.py 순서입니다. 초기화와 사용자 로그인 사이의 수동 단계가 있으므로 두 Python 파일만으로 자동 완료되지 않습니다.                           |
| agent-browser 버전·컨텍스트는?   | 당시 버전 미기록, 현재 0.27.0입니다. 같은 프로필·GS 탭·채널 상태·Nuxt 컨텍스트를 유지했습니다. 일반 Chrome 개발자 도구로도 같은 공식 모듈을 호출할 수 있도록 안내했습니다.                               |
| Windows에서도 검증했나요?        | 아니요. PowerShell/수동 Chrome 경로는 안내이며 Windows 전체 성공을 보장하는 검증 기록은 없습니다. NTFS ACL·실행 파일/shim·중계 권한 검사를 따로 확인해야 합니다.                                         |

추가 질문을 보내실 때는 OS·Python/agent-browser 버전, 마지막 완료 단계, 모듈 경로/export 이름, 교환 요청 발생 여부·HTTP 상태만 알려주세요. 인증 코드·토큰·쿠키·전체 callback URL·HAR는 보내지 않아도 됩니다.
