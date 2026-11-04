# 이 Mac의 올리브영 Safari 중계

`OY_RELAY_TRANSPORT=safari`는 Safari의 동일 출처 fetch를 기존 중계 큐·캐시·호출 한도 안에서 실행합니다. 공개 API·MCP·CLI·Tunnel·인증·누적 한도 원장은 바꾸지 않습니다. 기본값은 기존 browser 전송이며 다른 설치를 자동 전환하지 않습니다.

## 실행 조건

로그인하고 잠금 해제된 macOS 사용자 세션과 설치된 `~/.codex/skills/safari-minimized/scripts/safari.py`, Safari Automation 권한 및 JavaScript from Apple Events 허용이 필요합니다. 화면 캡처·Safari 확장·별도 MCP 서버는 필요하지 않습니다. LaunchAgent 실행에서도 실제 조회로 권한을 확인해야 합니다. 터미널 성공만으로 LaunchAgent 성공을 보장하지 않습니다.

요청마다 전역 Safari 작업 잠금을 얻어 고정 PID·창 ID의 최소화 창 하나를 만들고, 고정 올리브영 원점에서만 조회한 뒤 정리합니다. 사용자 창을 채택하거나 공유 Safari 프로세스를 종료하지 않습니다. 다른 작업이 잠금을 사용하면 `safari-busy` 실패를 반환합니다. 원본 실패를 정상 품절로 바꾸지 않습니다. 지속적인 수동 작업은 중계 가용성에 영향을 줄 수 있습니다.

원본 fetch의 15초 제한과 2MiB 응답 상한은 기존 실행부를 재사용합니다. Python helper는 18초에 SIGTERM으로 소유 창 회수를 시도하고, 종료가 멈추면 35초에 helper의 전용 프로세스 그룹만 강제 종료합니다. 최후 강제 종료 시 창·잠금이 남을 수 있습니다. `safari-session-<PID>.json`이나 잠금이 남아 있으면 자동 삭제하지 말고 소유 PID·창 ID와 정리 가능 여부를 확인합니다. 이 상한은 모든 대기 시간을 포함한 공개 응답 시간 보장이 아닙니다.

## 전환과 복원

검증한 코드를 runtime에 복사한 뒤 환경 파일의 전송 모드만 변경합니다. 토큰과 quota 파일은 보존합니다. 기존 OY LaunchAgent 정상 중지와 소유 Chrome 회수 확인 후 Safari 모드로 시작합니다. OY Chrome 숨김 도우미는 별도 중지해야 하며 Tunnel과 다른 서비스 중계는 유지합니다.

실패 시 OY LaunchAgent를 중지하고 Safari 소유 창 회수를 확인한 뒤 기존 전송 모드와 숨김 도우미를 복원합니다. 소유권이 불명확한 창이나 사용자 브라우저 전체를 종료하는 방식으로 복구하지 않습니다. 실제 캐시 우회 상품·매장·재고·오특과 CLI/MCP 검증 전에는 운영 전환 완료로 기록하지 않습니다.

## 검사

```sh
python3 tests/relay/test_oliveyoung_safari.py
npm test -- tests/relay/safari-lifecycle.test.ts tests/relay/transport-lifecycle.test.ts
npm run test:coverage
```

모든 검사는 순차 실행하며 전체 검사·self-hosted CI와 실제 원본 브라우저 검증을 겹치지 않습니다. 최종 운영 검증 기록은 로컬 PROJECT.md에 남깁니다.

## 편의점 중계의 세븐일레븐 예외 복구

`SEVEN_RELAY_TRANSPORT=safari`는 기존의 일반 HTTP 조회를 유지하며 403일 때만 Safari에서 동일한 공개 조회를 한 번 실행합니다. `SEVEN_BROWSER_EXECUTABLE`의 Chrome 준비 경로 대신 선택하며, 개인 쿠키를 읽거나 외부로 복사하지 않습니다. 추가 조회는 기존 quota를 차감합니다. 원본 상태와 Retry-After를 보존하고, 실패 대기 60초·취소·대기열 재확인·2MiB 상한을 적용합니다. 잘못된 결과나 fetch 실패를 빈 HTTP200으로 만들지 않습니다. 올리브영과 동일한 전역 잠금을 사용하므로 새 창을 겹쳐 만들지 않습니다.

이 Mac은 운영 Node v24.15.0에 대한 Safari 자동화 권한을 별도로 승인받았습니다. ChatGPT에서 성공해도 다른 Node 실행 파일의 LaunchAgent 권한은 동일하지 않습니다. macOS 시스템 확인창은 사용자가 직접 승인해야 할 수 있습니다. 코드만으로 TCC 권한을 우회하거나 초기화하지 않습니다.
