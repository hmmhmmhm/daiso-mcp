# 웹 읽기 독립 실험 Worker 계획

목표: 운영 원본을 호출하지 않고 웹 읽기 실패 조건과 요청 도달 여부를 비교한다.

구성: `experiments/web-read-lab/worker.ts`의 고정 테스트와 별도 SQLite Durable Object 로그, 전용 Wrangler 설정 및 GitHub 배포 workflow. 운영 바인딩·인증·도구 목록과 분리한다.

- [ ] `tests/scripts/web-read-lab.test.ts`로 HTML/JSON, 경로·쿼리, 지연, 리다이렉트, 생성 번호, 개인정보 미저장, 로그 개수/수명 제한을 검증한다. 먼저 실패를 확인한다.
- [ ] 고정 HTML/text/JSON, 한글/path/query, redirect, 1/5/15초 지연, 64/256KiB 본문, cache/no-store/noindex, JS 전용 본문을 구현한다. 임의 지연이나 외부 URL 전달 기능은 제공하지 않는다.
- [ ] GET/HEAD만 허용한다. 관측 로그는 실험명·단계·시각·서버 생성 번호·분류된 클라이언트만 기록한다. IP/쿠키/인증/전체 UA를 저장하지 않는다. 최대128개,24시간 보관한다.
- [ ] 별도 Worker `daiso-web-read-lab`을 기존 승인된 GitHub 배포 인증으로 배포한다. 운영 원본 요청은 하지 않는다.
- [ ] CI/리뷰 후 병합하고 실제 배포 링크를 확인한다. 새 실험 URL의 웹 읽기 open/click, 일반 HTTPS를 비교하고 도달 로그 및 응답 번호를 대조한다.
- [ ] 실패하면 동일 URL 반복보다 하나의 조건만 바꿔 비교한다. 외부 웹 도구 내부 원인을 관측 없이 확정하지 않는다. 결과와 재현 방법을 문서 및 PROJECT.md에 기록한다.
