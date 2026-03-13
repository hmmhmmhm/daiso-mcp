# GS25 New libapp.so 디컴파일 도구 전략 (2026-03-13)

## 결론 요약

- 현재 GS25는 `blutter`로 이미 유효 신호를 추출했다.
- 따라서 1순위는 계속 `blutter` + Frida 계측 결합이다.
- `blutter`가 막히는 경우에만 `reFlutter`(패치 리패키징)로 우회하고,
  `darter`는 최신 스냅샷 호환성 한계로 보조 참고 수준이다.

## 1) blutter 결과 (실측)

- 입력: `tmp/gs25-static/lib-extract-201451/lib/arm64-v8a`
- 출력: `tmp/gs25-static/blutter-out-gs25`
- 확인된 핵심 신호:
  - `ApiResponseEncryptionUtility::createEncrypter`
  - `Encrypter::decrypt64`, `Encrypter::encryptBytes`
  - `M_WOODONGS_WEB_URL`, `B2C_REFRIGERATOR_API_URL`
  - `/api/bff/v4/auth/getWoodongsUserInfo`
  - 다수의 `/refrigerator/v1/...` 경로

자동 요약 파일:

- `docs/gs25-new-blutter-signal-summary.md`

## 2) 대체 도구 웹 리서치 + 로컬 검증

### A. reFlutter (차선책 1)

- 공식: https://github.com/ptswarm/reFlutter
- 성격:
  - 정적 디컴파일 도구라기보다, Flutter 엔진 패치 후 재패키징/동적 분석 프레임워크
  - `socket.cc`/`dart.cc` 패치로 트래픽/심볼 덤프 유도
- 장점:
  - 핀닝/프록시 가시성 부족 시 우회 가능성이 있음
- 리스크:
  - 재서명/무결성/탐지 이슈
  - 운영환경에서는 앱 동작 차이 발생 가능

### B. darter (차선책 2, 제한적)

- 공식: https://github.com/mildsunrise/darter
- 상태:
  - README에서 최신 버전 비호환 가능성을 명시
  - GS25 `libapp.so` 실측 결과도 버전 불일치로 실패
- 로컬 실험 로그 요점:
  - `Version (...) doesn't match with the one this parser was made for`
  - `strict=False`로도 후속 파싱에서 `KeyError(3)` 발생
- 판단:
  - 최신 Flutter 대상 메인 도구로는 부적합

### C. Flutter TLS 우회 보조

- 공식: https://github.com/NVISOsecurity/disable-flutter-tls-verification
- 성격:
  - `libflutter.so` 패턴 매칭 기반 TLS 검증 우회 Frida 스크립트
- 용도:
  - `blutter` 정적 분석 결과로 잡은 API를 실제 트래픽에서 평문 확인할 때 보조

## 3) 실행 우선순위 (빠른 달성 기준)

1. `blutter` 산출물에서 호출 경로/암호화 유틸 시그니처 추출
2. 해당 지점에 Frida hook 배치 (`encrypt/decrypt`, `Dio` request builder)
3. 타깃 경로(`/refrigerator/v1`, `getWoodongsUserInfo`) 실호출 시점에서 평문 파라미터 수집
4. 위가 막힐 때만 `reFlutter`로 엔진 패치 라인 실험
5. `darter`는 참고 분석(문자열/구조 탐색) 수준으로 제한

## 4) 즉시 사용 커맨드

```bash
# blutter 핵심 신호 요약 생성
node scripts/gs25-new-blutter-signal-extract.mjs \
  --in tmp/gs25-static/blutter-out-gs25 \
  --out docs/gs25-new-blutter-signal-summary.md
```

```bash
# reFlutter 설치(필요 시)
pip3 install reflutter
```

```bash
# NVISO Flutter TLS 우회(필요 시)
frida -U -f com.gsretail.android.app -l disable-flutter-tls.js --no-pause
```
