# GS25 New 자율 실행 계획 (Full-Access 가정)

## 1. 목적

- 목표: GS25 앱의 재고 조회 구간(`b2c-apigw`/`b2c-bff`)에서 암복호화 경계를 식별하고, 재현 가능한 리플레이 단위까지 자동 수집한다.
- 제약: 사람 수동 조작 없이 에이전트가 단독으로 실행한다.
- 전제: 에이전트는 단말/프록시/후킹/패치/재실행 권한을 모두 가진다.

## 2. 핵심 가설

1. 현재 병목은 MITM 자체가 아니라 Flutter/Native 내부 직렬화 경계 미포착이다.
2. `msg-api`는 이미 재현 가능하므로 우선순위에서 제외한다.
3. `b2c` 구간은 HTTP/2+네이티브 경로일 가능성이 높아, Java 계층만으로는 불충분하다.
4. `code=301` wrapper protobuf의 `field#4` blob 생성 경계가 핵심 공략점이다.

## 3. 성공 기준

- S1: 한 세션 내 `b2c-apigw` 또는 `b2c-bff` 요청의 host/path/method를 평문으로 확보
- S2: 같은 요청 시점의 암호화 전 payload 또는 암호화 직후 payload를 추출
- S3: 동일 입력에서 동일 출력이 나오는 replay tuple(`token`, `field#4`, wrapper)을 3세트 이상 확보
- S4: 자동화 스크립트 1회 실행으로 S1~S3 재현

## 4. 전체 파이프라인

1. 환경 부트스트랩
2. 통신 가시성 강제(Flutter TLS + unpinning + QUIC 차단)
3. UI 플로우 완전 자동화(고정 시나리오)
4. 네이티브/Flutter 경계 후킹(301/303 중심)
5. 튜플 생성 및 리플레이 검증
6. 실패 시 자동 분기(도구 교체/패치/재시도)

## 5. 실행 단계

### Phase A. 환경 부트스트랩 (1회)

- 단말 연결 확인, 포트 포워딩, 앱 설치/실행 가능 상태 검증
- 프록시/인증서/패킷 캡처를 동시 시작
- 산출물 디렉터리 timestamp 생성

필수 산출물:

- `captures/gs25-new-<ts>/raw.mitm`
- `captures/gs25-new-<ts>/traffic.pcap`
- `captures/gs25-new-<ts>/agent-run.log`

### Phase B. 통신 가시성 강제

순서대로 자동 적용:

1. 표준 Frida unpinning + interception
2. Flutter TLS 우회 스크립트 주입
3. QUIC 차단(`BLOCK_HTTP3=true`)
4. 실패 시 APK 패치(apk-mitm/reFlutter 계열) 빌드/재설치

판정 규칙:

- `requests.jsonl`에 `b2c` host가 보이면 Phase C로 진행
- 안 보이면 patch profile을 바꿔 최대 3회 재시도

### Phase C. UI 자동 재현

- 에이전트가 고정 플로우를 자동 수행:
  - 앱 실행
  - 재고찾기 진입
  - 상품 검색
  - 목록/지도 전환
  - 매장 선택
- 접근성 실패 시 좌표 fallback + 재시도
- 화면 상태는 `uiautomator dump` + 스크린샷으로 동시 검증

판정 규칙:

- 핵심 이벤트 5종(`markers`, `marker_click`, `center`, `level`, `touchable`) 미충족 시 실패
- 실패 시 플로우 템플릿 자동 교체 후 재실행

### Phase D. 경계 후킹 (핵심)

- `libnms.so`에서 아래 경계 동시 후킹:
  - `meta(301/302/303)` 진입/반환
  - `FUN_00128654`, `FUN_001287a0`, 간접 분기 함수
- `code=303` 토큰 발급과 `301.field#2` 소비를 연계 기록
- `301.field#4` blob과 wrapper를 원본 바이너리로 저장

필수 산출물:

- `gs25-new-meta-events.jsonl`
- `gs25-new-301-pipeline-events.jsonl`
- `gs25-new-replay-tuples.json`

### Phase E. 리플레이 검증

- tuple 기반으로 2단계 검증:
  1. 앱 내부 재주입(동일 함수 호출 체인)
  2. 네트워크 경계 재주입(mitm injector)
- 성공/실패를 HTTP status, 응답 길이, 응답 해시로 자동 판정

성공 조건:

- 서로 다른 3개 세션에서 tuple 재사용 시 일관된 성공 패턴 확인

### Phase F. 실패 자동 분기

- 실패 유형 A: `b2c host` 미노출
  - 대응: TLS/patch profile 변경, QUIC 강제 차단 점검
- 실패 유형 B: host는 보이나 payload 경계 미노출
  - 대응: 후킹 포인트 확장(Conscrypt/NativeCrypto/SSL write direct)
- 실패 유형 C: tuple 생성되나 replay 실패
  - 대응: 토큰 TTL/세션 결합 가설 검증(발급 직후 짧은 윈도우 재시도)

## 6. 자동 오케스트레이션 정책

- 실행 단위: `round`
- 각 round는 `setup -> capture -> hook -> replay -> summarize` 순으로 고정
- round 종료 시 다음 JSON 작성:
  - `round_id`
  - `profile`
  - `b2c_seen`
  - `tuple_count`
  - `replay_success_count`
  - `next_action`
- `replay_success_count >= 3`이면 자동 종료

## 7. 도구 스택 (권장)

- 동적 후킹: Frida (spawn 우선)
- MITM: mitmproxy
- 패킷: tcpdump/Wireshark 보조 분석
- APK 패치: android-unpinner(apk-mitm + objection + reFlutter)
- UI 자동화: Maestro 또는 UIAutomator 스크립트
- 디컴파일/정적분석: Ghidra + jadx

## 8. 최소 구현 체크리스트

- [ ] `gs25-new` prefix 산출물 경로 통일
- [ ] Full 자동 실행 스크립트 1개(진입점) 제공
- [ ] round 실패 원인 자동 분류
- [ ] tuple 자동 생성 및 회귀 검증 포함
- [ ] 최종 요약 JSON + Markdown 리포트 자동 생성

## 9. 즉시 실행 우선순위

1. Flutter TLS 우회 + QUIC 차단 프로파일부터 고정
2. `303 token -> 301 field#2 -> field#4` 연계 캡처를 표준화
3. tuple 재주입 성공 패턴이 나올 때까지 profile만 교체하며 반복

## 10. 완료 정의

- `msg-api`가 아닌 `b2c` 경로에서 replay tuple이 재현 가능하고,
- 같은 자동 실행 명령으로 연속 3회 성공하면 이 작업을 완료로 본다.

## 11. 구현 상태 (2026-03-13)

추가된 실행기:

- `scripts/gs25-new-autonomous-run.sh`
  - 라운드 반복 오케스트레이션
  - 프로파일 순환(`baseline, flutter_tls, patch_cycle`)
  - 라운드 요약 누적(`manifest.jsonl`)
- `scripts/gs25-new-round-summary.ts`
  - `b2cSeen`, `tupleCount`, `replaySuccessCount`, `nextAction` 자동 판정

기본 실행 예시:

```bash
bash scripts/gs25-new-autonomous-run.sh \
  --rounds 6 \
  --target-success 3 \
  --window 120 \
  --with-mitm \
  --replay-check
```

드라이런(명령 점검) 예시:

```bash
bash scripts/gs25-new-autonomous-run.sh --rounds 2 --window 1 --dry-run
```

주요 산출물:

- `captures/gs25-new-autonomous-<timestamp>/agent-run.log`
- `captures/gs25-new-autonomous-<timestamp>/manifest.jsonl`
- `captures/gs25-new-autonomous-<timestamp>/final-summary.json`
- `captures/gs25-new-autonomous-<timestamp>/round-*/round-summary.json`
