# GS25 New Blutter 분석 정리 (2026-03-13)

## 범위

- 이 문서는 `blutter` 결과만 정리한다.
- 입력 바이너리: `tmp/gs25-static/lib-extract-201451/lib/arm64-v8a/libapp.so`
- 분석 산출물: `tmp/gs25-static/blutter-out-gs25`

## 핵심 결론

1. GS25 앱의 Flutter AOT 산출물에서 B2C 관련 네트워크 인터페이스가 확인된다.
2. `ApiResponseEncryptionUtility` 경로에서 `encrypt` 패키지 기반 암복호화 사용 흔적이 확인된다.
3. B2C/Woodongs 관련 상수와 경로 문자열이 객체 풀(`pp.txt`)에 존재한다.

## 증거 (blutter 산출물 기준)

### 1) 암복호화 유틸

- 파일: `asm/gstown/src/network/api_response_encryption_utility.dart`
- 확인 항목:
  - `ApiResponseEncryptionUtility::createEncrypter`
  - `Encrypter::decrypt64`
  - `Encrypter::encryptBytes`
- 문자열 상수:
  - `NUE97O2A2KxIANauwqJ6m8MXiz7KY7FN`
  - `TNldfnGlVWAsvE4VmZnw0jSK8+m/0eCT`

### 2) B2C 인터페이스

- 파일: `asm/gstown/src/network/interface/b2c_api_interface.dart`
- 확인 항목:
  - `package:gstown/src/network/interface/b2c_api_interface.dart` 심볼 다수
  - `/refrigerator/v1/...` 경로 문자열 다수
    - 예: `/refrigerator/v1/shopping/reservation/delivery/item`
    - 예: `/refrigerator/v1/shopping/special/sell/items/detail`
    - 예: `/refrigerator/v1/delivery/order/`

### 3) Woodongs/B2C 상수 및 경로

- 파일: `pp.txt`
- 확인 항목:
  - `M_WOODONGS_WEB_URL`
  - `B2C_REFRIGERATOR_API_URL`
  - `/api/bff/v4/auth/getWoodongsUserInfo`

## 현재 판단

- `blutter`만으로도 GS25 앱 내부에 B2C/냉장고(`refrigerator`) 계열 API 경로와
  별도 암복호화 유틸이 존재한다는 정적 근거는 충분하다.
- 즉, "Flutter 기반 + 내부 앱 레이어 암복호화 + B2C 네트워크 인터페이스 존재"까지는
  `blutter` 산출물만으로 확인 완료 상태다.

## 관련 파일

- `tmp/gs25-static/blutter-out-gs25/pp.txt`
- `tmp/gs25-static/blutter-out-gs25/asm/gstown/src/network/api_response_encryption_utility.dart`
- `tmp/gs25-static/blutter-out-gs25/asm/gstown/src/network/interface/b2c_api_interface.dart`
- `tmp/gs25-static/blutter-out-gs25/asm/gstown/src/network/grm_auth_api.dart`
- `docs/gs25-new-blutter-signal-summary.md` (자동 추출 결과)
