# GS25 New 원인 분석 및 가속 전략 (2026-03-13)

## 1) 현재 상태 요약

- 최신 자동 실행: `captures/gs25-new-autonomous-20260313-100737`
- 결과:
  - `tupleCount=1` (PGL 301 튜플은 확보)
  - `metaSignals.code301Returns=1`, `metaSignals.code303Returns=1`
  - `b2cSeen=false`, `replaySuccessCount=0`
- 즉, **PGL 계열 파이프라인은 잡히지만, 목표인 GS25 재고/B2C 경로는 아직 비노출** 상태.

## 2) 질문별 결론

### Q1. Flutter 기반은 맞는데, protobuf를 "확실"히 쓰는가?

- **부분적으로는 확실**.
- 기존 문서/캡처에서 `code=301` wrapper가 protobuf wire-format으로 해석된 근거가 누적됨.
- 다만 `field#4` 내부 blob은 고엔트로피/별도 포맷(암호문/압축) 가능성이 높아, 전체가 단일 평문 protobuf라고 보긴 어려움.
- 결론: **상위 wrapper protobuf 사용은 강한 증거가 있음. 내부 본문은 별도 포맷 가능성 큼.**

### Q2. gRPC인가?

- **현재 증거로는 gRPC라고 보기 어려움**.
- gRPC는 HTTP/2 + `content-type: application/grpc` 패턴이 핵심인데, 현재 수집된 평문/후킹 로그에서 해당 시그널이 확인되지 않음.
- 현재 관측은 `msg-api`/광고·분석 축이 중심이며, 목표 `b2c-apigw`/`b2c-bff` 구간이 노출되지 않아 확정 불가.

### Q3. 인증서 피닝인가?

- **피닝/신뢰 고정 계층이 존재할 가능성이 매우 높음**.
- 최신 라운드에서도 mitm 로그에 다수의 `client does not trust the proxy certificate` 실패가 반복.
- 이는 최소 일부 도메인/경로가 사용자 CA를 신뢰하지 않거나 별도 검증(핀/커스텀 trust) 경로를 탄다는 뜻.

### Q4. 암호화 통신은 수집했는가?

- **수집함. 다만 목표 경로가 아님**.
- 네이티브 SSL read/write 후킹으로 `msg-api` 요청/응답 평문 일부는 반복 확보.
- `b2c-apigw`/`b2c-bff` 평문/리플레이 가능한 request_e/response_e 쌍은 아직 미확보.

## 3) 실패의 핵심 원인(우선순위)

1. **타깃 트래픽 미유도(UI 상태 문제)**

- 자동 탭이 검색/재고찾기 플로우를 시도하지만, 실제 `b2c` 호출 조건(주소/권한/상태 모달/세션 상태)까지 안정적으로 충족하지 못함.

2. **관측 축이 PGL 쪽으로 치우침**

- PGL 301/303 경로는 잘 잡히지만, 이것이 곧 재고 B2C API 평문 확보를 의미하지 않음.

3. **네트워크 가시성 분산**

- 일부 트래픽은 MITM 거부, 일부는 네이티브 hook에서만 보임.
- 결과적으로 단일 수집면(프록시만/Java만)으로는 완전한 재현이 어려움.

4. **실행 파이프라인 내 블로킹 리스크**

- `replay-check` 단계 무기한 대기 가능성이 있어 전체 캠페인 처리량이 떨어졌음.
- 2026-03-13에 `scripts/gs25-new-autonomous-run.sh`에 replay-check 120초 상한을 반영해 완화.

## 4) "가장 빠른 달성" 기준 실행 전략 (무인/전체권한 가정)

### A. 성공 조건 재정의 (즉시)

- 1차 성공: `b2c-apigw|b2c-bff` host/path를 평문으로 1회 이상 관측
- 2차 성공: 동일 요청 단위의 최소 replay tuple 1세트 확보
- 3차 성공: replay 결과에서 상태/길이/해시 일치 1회 이상

### B. 라운드 구조 단순화 (속도 우선)

- 초기 5~10라운드는 replay-check를 끄고 `b2c host 노출`만 목표화
- host가 잡힌 라운드에서만 replay-check 후속 실행
- 이유: 현재 병목은 replay 성공이 아니라 **b2c 트리거 자체**

### C. UI 유도 강화 (핵심)

- `hybrid` + `keyword` 흐름을 라운드별 교차 사용
- UIA XML 기반 상태판단(주소설정/권한/팝업/검색결과 없음)을 조건분기화
- 좌표 fallback은 마지막 수단으로 축소

### D. 계측면 이중화

- mitmproxy + native SSL hook 동시 유지
- `b2c host` 감지 시점 전후 30~60초 고해상도 덤프(바이너리/hex/stream) 집중 저장

### E. 차선책 (필요 시)

- 동적 우회로 불충분하면 앱 패치 기반 접근 병행:
  - `mitmproxy/android-unpinner` 계열로 패치 실험
- 단, 패치 빌드는 앱 무결성/탐지 우회 이슈를 수반하므로 병렬 실험군으로 분리

## 5) 바로 실행할 커맨드(권장)

```bash
# 1) b2c host 노출만 빠르게 탐색 (replay-check 끔)
bash scripts/gs25-new-autonomous-run.sh \
  --rounds 6 \
  --target-success 1 \
  --window 75 \
  --with-mitm \
  --ui-script scripts/gs25-hybrid-flow.sh

# 2) host 노출 라운드가 나오면 해당 라운드만 replay-check 별도 실행
bash scripts/gs25-301-replay-mitm-run.sh \
  --tuple <해당 round의 301-replay-tuples.json> \
  --index 0 \
  --duration 45 \
  --out <새 출력 디렉터리>
```

## 6) 참고 소스(공식/1차 문서)

- gRPC over HTTP/2 스펙: https://grpc.github.io/grpc/core/md_doc__p_r_o_t_o_c_o_l-_h_t_t_p2.html
- Protocol Buffers wire format: https://protobuf.dev/programming-guides/encoding/
- Frida Android 문서: https://frida.re/docs/android/
- Frida Modes (spawn/attach): https://frida.re/docs/modes/
- mitmproxy Addons 개요: https://docs.mitmproxy.org/stable/addons/overview/
- OWASP MASTG Pinning Bypass: https://mas.owasp.org/MASTG/techniques/android/MASTG-TECH-0012/
- mitmproxy android-unpinner: https://github.com/mitmproxy/android-unpinner

---

판단 근거는 본 저장소의 GS25 캡처 로그(`docs/gs25-*`, `captures/gs25-new-autonomous-*`)와 위 공식 문서를 결합해 도출함.

## 7) 2026-03-13 추가 실험 비교

- 실험 A (`hybrid`, replay-check on):
  - `captures/gs25-new-autonomous-20260313-100737`
  - `tuple=1`, `code301/303 관측`, `b2cSeen=false`
  - replay-check는 `applied=0`, `results=0`
- 실험 B (`keyword`, replay-check off):
  - `captures/gs25-new-autonomous-20260313-101410`
  - `tuple=0`, `code301/303 미관측`, `b2cSeen=false`
  - 여전히 `msg-api/setConfig` 중심

결론:

- 현재 기준으로는 `keyword` 단독보다 `hybrid`가 계측 신호(튜플/PGL) 품질이 더 높음.
- 그러나 두 케이스 모두 `b2c` 트리거에는 실패했으므로, 다음 라운드는 UI 상태분기(주소/권한/모달) 강화가 최우선임.

## 8) 2026-03-13 SSL bypass 동시주입 결과

- 실행:
  - `captures/gs25-new-autonomous-20260313-103950`
  - 옵션: `--ssl-bypass-script scripts/frida/android-ssl-bypass.js`
- 결과:
  - 2/2 라운드 모두 `b2cWoodongsConnectSeen=true`
  - `m.woodongs.com`, `b2c-pay.woodongs.com` CONNECT는 반복 관측
  - 그러나 둘 다 MITM에서 여전히 `Client TLS handshake failed ... certificate unknown`
  - `tupleCount=1`은 유지, `replaySuccess=0` 유지
- 해석:
  - 현재 `android-ssl-bypass.js`는 일부 도메인(`unityads` 등)에만 효과 신호가 보이고,
  - 목표 `woodongs` 계열 신뢰검증 경로는 우회하지 못함.

## 9) 웹 리서치 기반 우선 도구/방법론

### 9.1 우선순위 1: CA 신뢰 경로 강제 (Android 14+)

- NVISO `AlwaysTrustUserCerts`:
  - user cert를 system trust store(또는 conscrypt APEX store)로 자동 반영
  - Android 7~16 대응 명시
  - 링크: https://github.com/NVISOsecurity/AlwaysTrustUserCerts
- NCC `ConscryptTrustUserCerts`:
  - Android 14의 `com.android.conscrypt` APEX trust store 반영 전용
  - 링크: https://github.com/nccgroup/ConscryptTrustUserCerts

의미:

- 현재 관측된 `certificate unknown`은 사용자 CA 신뢰 경로 자체 문제일 수 있으므로,
  Frida hook 이전에 시스템 신뢰경로를 먼저 안정화하는 것이 처리량 측면에서 유리함.

### 9.2 우선순위 2: Flutter/난독화 대응 unpinning 세트

- HTTP Toolkit `frida-interception-and-unpinning`:
  - `android-certificate-unpinning.js`
  - `android-certificate-unpinning-fallback.js`
  - `android-disable-flutter-certificate-pinning.js`(실험적)
  - 링크: https://github.com/httptoolkit/frida-interception-and-unpinning
- 보조 universal 스크립트:
  - `frida_universal_pinning_bypasser.js`
  - 링크: https://gist.github.com/akabe1/ac6029bf2315c6d95ff2ad00fb7be1fc

의미:

- 현재 단일 스크립트(`android-ssl-bypass.js`)로 `woodongs`가 안 풀리므로,
  Flutter/Conscrypt/obfuscated fallback 포함 다중 스크립트 조합으로 교체 필요.

## 10) 2026-03-13 모듈 적용 실험 결과

- 적용:
  - `trustusercerts` (NVISO AlwaysTrustUserCerts)
  - `nccgroup-conscrypt-trustusercerts` (NCC ConscryptTrustUserCerts)
  - Frida 다중 우회 스크립트 동시 주입 (`android-ssl-bypass.js`, `gs25-advanced-unpinning.js`)
- 대표 실행:
  - `captures/gs25-new-autonomous-20260313-111204`
    - `woodongs_connects=3`, `woodongs_tls_fail=3`, `woodongs_requests=0`
  - `captures/gs25-new-autonomous-20260313-113445` (3라운드)
    - `woodongs_connects=0`, `woodongs_tls_fail=0`, `woodongs_requests=0`
    - `msg-api`/광고 트래픽 위주로만 수집

해석:

- 모듈 적용만으로 `woodongs` 평문 요청 전환은 확인되지 않음.
- 최근 라운드는 아예 `woodongs` 트래픽 유도 자체가 약해져, 우회 효과 판정보다 **타깃 트리거 안정화(UI 상태/세션 조건)**가 다시 1순위가 됨.

## 11) 2026-03-13 러너 안정화 수정 + 회귀 실행

- 수정 사항:
  - `scripts/gs25-new-autonomous-run.sh`
  - `scripts/gs25-new-round-runner.sh`
  - `run_with_timeout`가 `timeout/gtimeout` 미설치 환경(macOS 기본)에서 무제한 실행으로 떨어지던 문제 수정
  - 현재는 내부 watchdog(`sleep + kill TERM/KILL`)로 타임아웃을 강제함
- 신규 도구:
  - `scripts/gs25-new-preflight-check.sh`
    - ADB 연결/패키지/frida-server/adb forward/http_proxy/root modules/app pid를 실행 전 점검
  - `scripts/gs25-new-capture-scoreboard.mjs`
    - `captures/gs25-new-autonomous-*`를 일괄 집계해 `b2c/tuple/woodongs` 신호를 표로 비교
- 회귀 실행:
  - `captures/gs25-new-autonomous-20260313-145708`
  - preflight: `fail=0`, `warn=0`
  - 라운드 종료 정상 확인 (`15:01:18`)
  - 결과: `isRoundSuccess=false`, `tupleCount=0`, `woodongs 신호 없음`, `nextAction=rotate_visibility_profile`

의미:

- 실행 인프라 안정성(무한 대기)은 개선됨.
- 그러나 본질 병목은 그대로 `woodongs/b2c 트리거 재현성`이며, 우회 품질 이전에 UI 상태 분기 강화를 더 밀어야 함.

## 12) 2026-03-13 집중 3라운드 재실행 결과

- 실행:
  - `captures/gs25-new-autonomous-20260313-150357`
  - `profiles=baseline,flutter_tls,patch_cycle`
  - `--ssl-bypass-script android-ssl-bypass + advanced-unpin + native-verify-bypass`
- 결과:
  - round1 `tuple=0`, `b2cSeen=false`
  - round2 `tuple=1`, `b2cSeen=false`
  - round3 `tuple=0`, `b2cSeen=false`
  - 전체 `woodongs` 신호 미관측
- 관찰:
  - `www.google.com / connectivitycheck.gstatic.com` TLS 실패 루프가 다수 반복
  - 앱 상태 전환을 방해하는 노이즈로 작동할 가능성 높음

## 13) 2026-03-13 노이즈 저감 실험(captive portal 비활성)

- 러너 옵션 추가:
  - `--disable-captive-check <0|1>` (기본 1)
  - 실행 중 `settings put global captive_portal_mode 0`
  - 종료 시 원값 자동 복구
- 실행:
  - `captures/gs25-new-autonomous-20260313-193829`
- 비교:
  - 이전(`151808`) `google TLS fail=9`
  - 이후(`193829`) `google TLS fail=0`
- 결과 해석:
  - 네트워크 검증 루프 노이즈는 유의미하게 감소했음.
  - 다만 `woodongs/b2c`는 여전히 미노출로, 다음 병목은 UI/세션 조건 충족임.
