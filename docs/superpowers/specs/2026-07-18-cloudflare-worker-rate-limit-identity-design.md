# 교차 존 Worker 호출 제한 식별자 설계

## 배경

공개 Zyte 연동 GET API는 `CF-Connecting-IP`를 SHA-256으로 해시해 KST 기준 하루
3,000회로 제한한다. Cloudflare는 다른 존의 Worker가 `fetch()`로 호출한 요청에 실제
방문자 IP 대신 모든 교차 존 요청이 공유하는 특수 IP를 넣는다. 이 때문에 서로 다른
외부 Worker 존이 같은 일일 카운터를 사용하고, 한 Worker의 대량 호출이 다른 Worker의
정상 요청까지 차단할 수 있다.

Cloudflare가 교차 존 Worker 요청에 추가하는 `CF-Worker` 헤더에는 요청을 만든 Worker의
upstream zone이 들어 있다. 일반 클라이언트가 보낸 `CF-Worker` 값은 신뢰하지 않고,
Cloudflare의 교차 존 특수 IP가 확인된 경우에만 이 헤더를 제한 식별자로 사용한다.

## 목표

- 일반 요청은 지금처럼 실제 `CF-Connecting-IP`별로 KST 하루 3,000회를 제한한다.
- 교차 존 Worker 요청은 `CF-Worker` upstream zone별로 KST 하루 3,000회를 제한한다.
- IP와 Worker 존 원문을 Durable Object 이름이나 저장소에 남기지 않는다.
- 헬스 체크 우회, 보호 경로, fail-open 정책과 응답 헤더는 바꾸지 않는다.
- 기존 일반 IP의 당일 카운터를 유지한다.

## 제외 범위

- 교차 존 Worker 뒤에 있는 최종 방문자별 제한은 구현하지 않는다. Cloudflare가 해당 IP를
  목적지 존에 전달하지 않으므로 신뢰할 수 있는 원본 값이 없다.
- Worker 존별 별도 한도나 allowlist는 추가하지 않는다.
- 정확한 차단 집계나 Workers Observability 설정은 이번 변경에 포함하지 않는다.

## 대안 검토

### 1. 교차 존 요청을 `CF-Worker` 존별로 분리 — 채택

일반 IP는 기존 문자열을 그대로 해시하고, 교차 존 특수 IP와 `CF-Worker`가 함께 있으면
정규화한 `worker-zone:<zone>` 문자열을 해시한다. 서로 다른 Worker 존의 카운터가 분리되고
기존 직접 사용자의 Durable Object 이름은 바뀌지 않는다.

### 2. 교차 존 요청을 제한에서 제외 — 기각

오차단은 없어지지만 대량 호출자가 Cloudflare Worker를 앞에 두는 것만으로 제한을 우회할
수 있어 Zyte 비용 방어 목적을 훼손한다.

### 3. 현재 특수 IP 공유 버킷 유지 — 기각

구현 변경은 없지만 여러 외부 Worker 존이 서로의 할당량을 소진하는 문제가 계속된다.

## 식별자 결정 규칙

`resolveRateLimitIdentity(request)`는 다음 순서로 식별자를 결정한다.

1. `CF-Connecting-IP`가 없거나 공백이면 `null`을 반환하고 기존처럼 제한을 적용하지 않는다.
2. IP가 교차 존 특수 IP가 아니면 IP 문자열을 그대로 반환한다.
3. IP가 교차 존 특수 IP이고 `CF-Worker`가 있으면 존 이름의 앞뒤 공백을 제거하고 소문자로
   바꾼 뒤 `worker-zone:<zone>`을 반환한다.
4. 특수 IP지만 `CF-Worker`가 없거나 공백이면 특수 IP 자체를 반환해 기존 공유 버킷으로
   제한한다. 헤더 누락이 제한 우회로 이어지지 않게 하기 위한 방어 동작이다.

선택된 식별자는 기존 `hashRateLimitIdentity()`에서 SHA-256으로 해시한 뒤 Durable Object
이름으로 사용한다. 일반 IP 문자열 형식을 바꾸지 않으므로 기존 직접 사용자 카운터가
유지된다. 교차 존 요청은 새 식별자로 이동하므로 배포 당일 각 Worker 존에 새 3,000회
버킷이 한 번 부여된다.

## 보안과 오류 처리

- 직접 요청은 `CF-Worker`를 보내더라도 일반 IP 버킷을 사용한다.
- 교차 존 특수 IP는 Cloudflare가 설정하므로 일반 클라이언트가 임의로 만들 수 없다.
- `CF-Worker` 원문은 로그나 저장소에 기록하지 않고 해시 입력으로만 사용한다.
- Durable Object 호출 실패와 비정상 응답은 기존처럼 fail-open한다.

## 테스트

- 일반 IP는 `CF-Worker`가 있어도 기존 IP 해시를 사용한다.
- 같은 교차 존 Worker 존은 대소문자와 바깥 공백이 달라도 같은 해시를 사용한다.
- 서로 다른 교차 존 Worker 존은 서로 다른 Durable Object를 사용한다.
- 교차 존 특수 IP에 `CF-Worker`가 없으면 특수 IP 공유 버킷으로 제한한다.
- 기존 보호 경로, 헬스 체크 우회, 429 응답과 rate-limit 헤더 테스트가 계속 통과한다.
- 전체 테스트, 타입 검사, 린트, 포맷 검사, 빌드와 100% 커버리지를 검증한다.

## 배포 확인

`main` 푸시 후 Cloudflare 배포와 Health Checks 성공을 확인한다. 운영 tail에서 교차 존 요청의
Durable Object 호출과 429 응답에 새 예외가 없는지 확인한다. 과거 Analytics는 특수 IP로만
집계되어 Worker 존별 소급 분리가 불가능하므로, 배포 이후 요청부터 동작을 판단한다.
