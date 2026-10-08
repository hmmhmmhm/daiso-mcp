# 디트릭스 Mac HTTPS 중계

## 구성
Cloudflare에서 디트릭스로 나가는 연결이 실패할 때 Mac의 일반 HTTPS 요청을 사용한다. 브라우저·탭·Zyte는 사용하지 않는다. 원본 네트워크 장애를 고치는 것이 아니라 검증된 Mac 출발 경로를 이용하는 운영 구성이다.

```text
MCP / REST → Cloudflare Worker
            → Cloudflare Access + Tunnel
            → 127.0.0.1:4320 디트릭스 프로세스
            → https://api.dtryx.com (공개 조회 GET)
```

Worker 설정이 없으면 기존 직접 요청을 유지한다. 설정이 있으면 중계만 사용하며 실패 뒤 원본 재시도나 유료 폴백은 하지 않는다.

## Worker 설정
- `DTRYX_RELAY_URL`: 중계 기본 HTTPS URL. 로컬 시험만 localhost/127.0.0.1 HTTP 허용.
- `DTRYX_RELAY_TOKEN`: 디트릭스 전용 Bearer 토큰.
- `DTRYX_ACCESS_CLIENT_ID`, `DTRYX_ACCESS_CLIENT_SECRET`: Access 서비스 토큰 쌍.

Access 서비스 자격증명은 중계에만 보내고 원본 디트릭스에는 전달하지 않는다. 리다이렉트를 따라가지 않는다. `/health`의 `config.dtryxRelay`로 비밀값 없이 설정을 확인한다. GitHub 시크릿도 같은 이름으로 보관하고 Sync Worker Secrets 워크플로로 복구할 수 있다.

## Mac 실행
Node24와 프로젝트 의존성이 필요하다. 환경 파일은0600, 상태 디렉터리는0700으로 제한한다.

```sh
node --max-old-space-size=128 --env-file=/absolute/path/dtryx.env \
  --import tsx scripts/relay/dtryx-start.ts
```

`dtryx.env`에는 `DTRYX_RELAY_TOKEN`, `DTRYX_RELAY_STATE_DIR` 절대 경로를 넣는다. `DTRYX_RELAY_PORT`는 생략 시4320이다. 설정 파일의 토큰을 버전 관리에 넣지 않는다. 올리브영과 다른 상태 디렉터리를 사용한다.

현재 Mac 설치는 `~/Library/Application Support/DaisoRelay/dtryx-runtime`, `dtryx.env`, `dtryx-state`를 사용하고 `page.aka.daiso-dtryx` LaunchAgent로 관리한다. GUI 사용자 로그인 세션이 필요하다. Node 힙128MiB 제한은 전체 프로세스 RSS128MiB 보장이 아니다.

## Tunnel 경로
기존 `oy-relay.aka.page` Access 정책을 적용한 상태에서 기존 올리브영 규칙 앞에 다음 ingress를 배치한다.

```json
{"hostname":"oy-relay.aka.page","path":"^/v1/dtryx/.*$","service":"http://127.0.0.1:4320"}
```

기존4319 올리브영 ingress 및 마지막404 규칙을 유지한다. 디트릭스 프로세스는 loopback에만 바인딩한다. Access 외에 핸들러 자체도 모든 경로에서 디트릭스 Bearer 토큰을 검증한다.

## 허용 계약과 상한
- `POST /v1/dtryx/timetable`: `brandCode`, `cinemaCode`, 유효한 `playDate`(YYYYMMDD).
- `POST /v1/dtryx/play-dates`, `POST /v1/dtryx/movies`: `brandCode`, `cinemaCode`.
- `GET /v1/dtryx/health`: 인증된 상태 조회.
- 임의URL·헤더·추가필드·알 수 없는 경로는 거절한다.
- 동시4개, 대기 포함32개, 전체15초 제한. 요청 본문16KiB, 원본 응답2MiB.
- 별도 파일 원장으로 분당300회·UTC일300000회를 제한한다. 재시작해도 유지되며 원장 장애는 차단한다.
- 성공은 원본의 `RetCode=success` 및 유효한 `Recordset`을 확인한 뒤 반환한다. 실패나 미확인 좌석을 정상 데이터로 만들지 않는다.

## 점검과 복구
먼저 로컬 인증 health와 세 API를 확인한 뒤 Access를 통한 같은 요청, 운영 REST/MCP를 확인한다. 올리브영의 health·실제 조회·탭 수를 함께 확인한다. 강제 종료 후 LaunchAgent 재시작 및 사용량 원장 보존을 확인한다.

중계를 중단할 때는 Worker의 디트릭스 설정을 제거하면 직접 요청으로 돌아가지만, 원본 연결 장애가 재현될 수 있다. 토큰을 Worker/GitHub/로컬에서 함께 교체한다. 올리브영 토큰이나 상태 파일을 덮어쓰지 않는다.
