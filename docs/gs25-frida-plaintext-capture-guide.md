# GS25 Frida 평문 캡처 가이드

작성일: 2026-03-14

## 개요

Flutter 기반 GS25 앱(우리동네GS)의 암호화된 API 요청/응답을 평문으로 캡처하는 방법을 설명합니다.

## 스크립트 위치

```
scripts/frida/gs25-blutter-encrypter-hook.ts (v4)
```

## 주요 기능

### 1. 암호화 전 평문 입력 캡처 (핵심!)

`_encrypt` 함수의 `onEnter`에서 암호화되기 전 평문 요청 데이터를 캡처합니다.

```javascript
Interceptor.attach(_encrypt_addr, {
  onEnter: function (args) {
    // args[0] ~ args[5] 탐색하여 평문 추출
    for (let i = 0; i < 6; i++) {
      const plaintext = readLargeData(args[i], 8192);
      if (plaintext && plaintext.includes('{')) {
        jsonLog({ t: 'ENCRYPT_INPUT', argIndex: i, plaintext });
      }
    }
  },
});
```

### 2. 복호화 후 평문 응답 캡처

`_decrypt` 함수의 `onLeave`에서 서버 응답 평문을 캡처합니다.

### 3. 후킹 지점 (libapp.so 오프셋)

| 함수                  | 오프셋   | 용도                              |
| --------------------- | -------- | --------------------------------- |
| `_encrypt`            | 0xa98420 | 요청 암호화 (onEnter로 평문 캡처) |
| `encrypter_encrypt`   | 0xa984c4 | 실제 암호화 함수                  |
| `_decrypt`            | 0xb07064 | 응답 복호화                       |
| `encrypter_decrypt64` | 0xa9b50c | Base64 복호화                     |

## 실행 방법

### 1. 사전 준비

- 루팅된 Android 기기
- frida-server 설치 (`/data/local/tmp/frida-server`)
- GS25 앱 설치

### 2. frida-server 시작

```bash
adb shell su -c '/data/local/tmp/frida-server &'
adb forward tcp:27042 tcp:27042
```

### 3. 앱 PID 확인

```bash
adb shell pidof com.gsr.gs25
```

### 4. Frida 스크립트 실행

```bash
# 실시간 로그 확인
frida -H 127.0.0.1:27042 -p {PID} -l scripts/frida/gs25-blutter-encrypter-hook.ts

# 파일로 저장
frida -H 127.0.0.1:27042 -p {PID} -l scripts/frida/gs25-blutter-encrypter-hook.ts 2>&1 | tee captures/frida-capture.log
```

### 5. 앱에서 원하는 기능 수행

앱에서 재고찾기 등 원하는 기능을 수행하면 로그에 평문이 캡처됩니다.

## 캡처되는 로그 형식

### 요청 평문 (ENCRYPT_INPUT)

```json
{
  "t": "ENCRYPT_INPUT",
  "argIndex": 2,
  "plaintext": "{\"headers\":{...},\"queryParameters\":{\"itemCode\":\"8801056038861\",...},\"data\":null}",
  "ts": 1773452253281
}
```

### 응답 평문 (DECRYPT_RESPONSE)

```json
{
  "t": "DECRYPT_RESPONSE",
  "data": "{\"statusCode\":200,\"data\":{\"stores\":[{\"storeCode\":\"VE463\",\"realStockQuantity\":\"15\",...}]}}",
  "ts": 1773452253291
}
```

## 실제 발견 사례

### 2026-03-14: 재고 API 파라미터 불일치 발견

**문제**: API 호출 시 수도권 매장 재고가 모두 0으로 반환됨

**원인**: 잘못된 좌표 파라미터명 사용

| 잘못된 파라미터 | 올바른 파라미터                                           |
| --------------- | --------------------------------------------------------- |
| `XCoordination` | `myPositionXCoordination` + `centerPositionXCoordination` |
| `YCoordination` | `myPositionYCoordination` + `centerPositionYCoordination` |
| (없음)          | `radiusCondition=500`                                     |

**발견 방법**: Frida v4 스크립트로 앱의 실제 요청 파라미터 캡처

```json
{
  "queryParameters": {
    "myPositionXCoordination": "126.841342",
    "myPositionYCoordination": "37.317730",
    "centerPositionXCoordination": "126.841342",
    "centerPositionYCoordination": "37.317730",
    "radiusCondition": 500,
    "serviceCode": "01",
    "itemCode": "8801056038861",
    "pickupStoreYn": "N",
    "realTimeStockYn": "Y"
  }
}
```

## 한글 인코딩 문제

캡처된 평문에서 한글이 깨져 보일 수 있습니다 (예: `HÅÀüÈ@ÇÈ` = 안산주은점).
이는 Frida의 메모리 읽기 방식 때문이며, JSON 구조와 영문/숫자 데이터는 정상적으로 캡처됩니다.

## 주의사항

1. **오프셋 변경**: 앱 업데이트 시 libapp.so 오프셋이 변경될 수 있음. blutter로 재분석 필요.
2. **앱 버전**: 테스트된 버전 - `5.3.35` (build 1854)
3. **기기**: SM-F926N (Android 15)

## 관련 파일

- `scripts/frida/gs25-blutter-encrypter-hook.ts` - Frida 후킹 스크립트
- `docs/gs25-final-replay-methodology.md` - API 리플레이 전체 방법론
- `tmp/gs25-static/blutter-out-gs25/` - blutter 분석 산출물
