# 현재 사용자 Mac 운영 보조 도구

`install-macos.py`의 전용 표준 계정 설치는 그대로 유지한다. `macos-ops.py`는 현재 GUI 사용자에게 숨김 도우미와 로컬 감시기를 추가한다. 현재 사용자 소유의 중계 런타임, 브라우저, Node 의존성, 터널과 로그인 세션은 먼저 준비해야 한다. 이 도구는 런타임 소유권을 검사하므로 기존 전용 계정 설치기의 root 소유 런타임을 현재 사용자 모드에서 직접 지정할 수 없다. 전용 계정 설치는 별도 운영 방식으로 유지한다. [전용 계정 Olive Young 설치기](../scripts/relay/install-macos.py)와 [디트릭스 중계 준비 절차](dtryx-relay.md)를 먼저 따른다. 이 보조 도구는 전체 중계 설치기가 아니다. 새 Mac에서 인증 자료는 운영자가 직접 제공하며 이 도구는 인증·환경·호출 원장 파일을 만들거나 교체하지 않는다.

## 계획과 설치

저장소 루트에서 실행한다. 기본 상태 디렉터리는 현재 사용자의 `~/Library/Application Support/DaisoRelay`, 기본 런타임은 그 아래 `runtime`이다. 기존 중계를 재설치하거나 Node 프로세스를 실행하지 않는다.

```sh
/usr/bin/python3 scripts/relay/macos-ops.py plan
/usr/bin/python3 scripts/relay/macos-ops.py install
/usr/bin/python3 scripts/relay/macos-ops.py install --notify-local --apply
```

앞의 두 명령은 파일을 쓰지 않는다. `--state-base /absolute/private/state`와 `--runtime /absolute/runtime`으로 위치를 바꿀 수 있다. 심볼릭 링크 경로, 다른 소유자, 쓰기 가능한 공개 파일은 거부한다. 상태 디렉터리와 환경 파일은 각각 0700, 0600이어야 한다. `/usr/bin/python3`와 `/usr/bin/swiftc`를 사용한다. 관리자·root 실행은 거부한다.

설치는 소스 해시별 `ops-helpers/<hash>`에 실행 파일과 소스를 보관하고 두 새 plist만 교체한다. 기존 plist는 개인 권한으로 백업하며 관리 표식이 없는 동일 이름 파일은 거부한다. 기존 helper 버전은 실행 중인 프로세스를 보호하도록 남긴다. 재사용하는 숨김 실행 파일에 실행 권한이 없으면 설치를 거부한다. 실행 중인 작업을 자동으로 내리거나 새 작업을 자동으로 올리지 않는다.

## GUI 세션 활성화

실제 경로를 설치 계획에 맞춘다. 이전 수동 숨김 작업 `page.aka.daiso-oliveyoung-hide`를 사용 중이면 검토 후 그 작업만 먼저 `launchctl bootout`한다. 중계 브라우저는 종료하지 않는다. 기존 plist를 보존하더라도 다음 로그인 때 중복 실행되지 않도록 이전 작업을 disable한다. 새 숨김 작업은 `page.aka.daiso-ops-hide`, 감시기는 `page.aka.daiso-ops-monitor`이다.

```sh
launchctl bootout "gui/$(id -u)/page.aka.daiso-oliveyoung-hide"
launchctl disable "gui/$(id -u)/page.aka.daiso-oliveyoung-hide"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/page.aka.daiso-ops-hide.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/page.aka.daiso-ops-monitor.plist"
```

업데이트할 때는 새 plist 설치 후 이 두 보조 작업만 `bootout`하고 다시 `bootstrap`한다. 중계·터널 작업의 종료나 재시작은 포함하지 않는다. 숨김 도우미는 비공개 `state/browser-owner.json`의 PID·부모 PID·생성 시각과 실제 프로세스 UID·실행 파일이 모두 맞을 때만 숨긴다. 이미 숨겨진 앱도 소유권을 검증한다. 새 브라우저 생성 시각 이후의 로컬 감시 기록이 `ready`를 확인한 다음 숨긴다. 초기 브라우저 생성과 숨김이 겹치지 않도록 이전 세션의 기록, 3분 넘게 오래된 기록, 준비 중 또는 실패한 기록은 사용하지 않는다. 감시 기록의 시각은 마지막 저장 시각이 아니라 조회 시작 시각을 사용해, 점검 도중 교체된 새 브라우저에 이전 준비 결과가 적용되지 않게 한다. 로컬 감시는 60초 주기이므로 준비 완료 뒤 숨김까지 최대 한 주기 지연될 수 있다. 사용자 Chrome이나 소유권이 불확실한 프로세스에는 요청하지 않는다.

## 감시와 상태 확인

```sh
/usr/bin/python3 scripts/relay/macos-ops.py monitor
/usr/bin/python3 scripts/relay/macos-ops.py status
```

감시 LaunchAgent는 로그인 시와 매 60초 실행한다. `relay.env`의 `OY_RELAY_TOKEN`, `dtryx.env`의 `DTRYX_RELAY_TOKEN`·`CONVENIENCE_RELAY_TOKEN`을 개인 파일에서 읽는다. 셸을 실행하거나 비밀값을 출력하지 않는다. 선택 환경 변수의 `KEY=` 빈 값은 허용하고 인증 토큰은 별도로 비어 있지 않은지 확인한다. 환경 파일의 포트·URL 값으로 감시 대상을 바꾸지 않는다. `GS25_AUTH_SESSION_FILE`을 지정한 경우 편의점 health의 인증 상태·로그인 필요 여부가 없거나 유효하지 않으면 `authentication-unobservable` 실패로 기록한다. `ready`는 access·refresh 만료 시각이 모두 미래인 경우에만 관측 가능한 정상 인증으로 판단한다. GS 세션을 구성하지 않은 중계는 인증 메타데이터 없이도 지원한다. 세션 파일 경로는 출력하지 않는다.

- Olive Young: `127.0.0.1:4319/health`
- 디트릭스: `127.0.0.1:4320/v1/dtryx/health`
- CGV: `127.0.0.1:4320/v1/cgv/health`
- 편의점: `127.0.0.1:4320/v1/convenience/health`
- 선택 터널 준비 상태: `127.0.0.1:20242/ready`

터널 포트는 설치·monitor 명령에 `--tunnel-port 20242`처럼 지정한다. 1024~65535만 허용하며 0은 터널 검사 생략이다. 터널의 loopback metrics 준비 엔드포인트는 별도로 구성해야 한다. `/ready` 성공은 로컬 터널 준비 상태만 의미하며 외부 공개 경로의 성공을 보장하지 않는다.

프록시를 사용하지 않고 리디렉션을 거부하며, 3초 연결 제한, 연결 후 헤더·본문 전체 4초 제한과 64KiB 본문 제한을 적용한다. `ops-status.json`은 0600으로 원자적으로 교체한다. 검사별 실패 여부, 연속 실패 횟수, 첫 실패 시각, GS 인증 상태·로그인 필요 여부·만료 시각·재시도 시각, 허용한 로그 오류·쿼터 숫자만 보존한다. 자체 쿼터의 `blockedBy`는 `null`, `minute`, `daily`만 허용하며 `minute`·`daily`이면 `reason: own-quota` 실패로 표시한다. 이는 원본 429와 별개인 중계 자체 한도이며 재고 0으로 바꾸지 않는다. status는 마지막 검사에서 180초가 넘거나 미래 시각이면 `stale: true`를 표시한다. 감시가 실행되지 않으면 파일은 자동 갱신되지 않는다.

`authentication.loginRequired: true`이면 [GS25 정상 로그인 복구 절차](gs25-auth-recovery-runbook.md)에 따라 사용자가 로그인한다. `retry_wait`는 정상 갱신 실패 후 대기이며 로그인 필요와 구분한다. `--notify-local`을 설치 또는 monitor에 지정하면 로그인 필요가 확인될 때 고정 문구의 macOS 로컬 알림을 요청한다. 로그인 필요로 전환한 첫 검사와 이후 6시간 간격으로만 요청하며, 실패한 요청도 같은 간격으로 제한한다. 상태의 `notification.state`는 `accepted`(osascript 요청 수락), `failed`, `disabled`, `not-required`를 구분한다. OS 알림 권한·집중 모드에 따라 보이지 않을 수 있으며 수락은 실제 열람을 의미하지 않는다. 외부 네트워크 메시지나 직접 대화 푸시는 지원하지 않는다. 지속 상태는 파일과 status에서 확인한다. 기존 launchd가 죽은 중계를 복구하고 Olive Young watchdog이 실패한 lifecycle을 복구한다. 감시기는 프로세스 종료·브라우저 재시작·쿠키 초기화·원본 재고 요청을 하지 않는다.

## 해제

```sh
launchctl bootout "gui/$(id -u)/page.aka.daiso-ops-hide"
launchctl bootout "gui/$(id -u)/page.aka.daiso-ops-monitor"
```

그 뒤 두 `page.aka.daiso-ops-*.plist`와 필요 없는 해당 plist 백업, `ops-helpers`, `ops-status.json`만 검토하여 삭제한다. 중계·터널 plist와 `relay.env`, `dtryx.env`, `state`, 인증·쿼터 원장은 보존한다. 기존 수동 숨김 도우미로 되돌리려면 이전 `page.aka.daiso-oliveyoung-hide` 작업을 `launchctl enable`한 뒤 보존한 기존 plist를 다시 bootstrap한다. 재부팅 후 실동작은 별도로 확인한다.
