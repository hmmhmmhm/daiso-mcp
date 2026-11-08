# 이 Mac의 Safari 작업 안내

2026-11-09 사용자가 다이소 중계와 다른 에이전트의 독립 Safari 작업을 승인했습니다. 기존 컴퓨터 전체 한 페이지 규칙 대신 작업별 한 창·한 페이지, 전체 최대 4개를 적용합니다.

다른 에이전트에게 전달할 메시지:

> Safari는 이제 작업별 전용 창과 개별 잠금으로 동작합니다. 다이소 중계가 끝날 때까지 기다리지 않아도 됩니다. `~/.codex/skills/safari-minimized/SKILL.md`의 최신 안내를 읽고, 작업 고유의 절대 세션 경로로 `start --independent-window`를 사용해 주세요. 기본 `start`도 같은 방식입니다.
>
> 저장된 Safari PID·창 ID로만 조작하고, 한 작업 안에서는 한 페이지를 재사용하세요. 전체 작업 창은 중계를 포함해 최대 4개이며 메모리 여유 20% 미만 또는 CPU 85% 초과이면 새 창이 거절됩니다. 이 경우 자원 회복 또는 본인 작업 종료 후 재시도하세요. 창 생성 구간만 짧게 직렬화됩니다.
>
> 성공·실패·중단 시 모두 `stop`으로 본인 창과 슬롯을 회수하세요. 다른 작업의 창·세션·슬롯·기존 전역 잠금은 삭제하지 마세요. 정리 실패 시 소유 상태를 보존하고 보고하세요. 공유 Safari 전체 종료·재시작은 별도 사용자 승인이 필요합니다. Chrome으로 자동 우회하지 마세요.

예시에서 두 경로는 실제 절대 경로로 바꿉니다.

```sh
python3 /Users/hm/.codex/skills/safari-minimized/scripts/safari.py --session /absolute/task/work/safari.json start --independent-window
python3 /Users/hm/.codex/skills/safari-minimized/scripts/safari.py --session /absolute/task/work/safari.json navigate 'https://example.com/'
python3 /Users/hm/.codex/skills/safari-minimized/scripts/safari.py --session /absolute/task/work/safari.json stop
```

별도 Safari 프로필이나 계정 격리가 생기는 것은 아닙니다. 창과 조작 소유권을 분리하며 동일 Safari 앱의 로그인 상태와 프로세스는 공유합니다. Blender의 단일 인스턴스 규칙과 전체 검사·운영 검증의 부하 보호 규칙은 유지합니다.
