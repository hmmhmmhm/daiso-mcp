# Web Read Lab

독립 Worker에서 웹 읽기 도구의 실패 조건을 비교합니다. 모든 상품과 수량은 가상 데이터이며 운영 API를 호출하지 않습니다. 기존 MCP 도구와 인증·중계·캐시 바인딩을 공유하지 않습니다.

배포: `.github/workflows/deploy-web-read-lab.yml`. Worker 이름은 `daiso-web-read-lab`이며 배포 결과의 workers.dev URL을 사용합니다.

## 실행

1. 영문·숫자·하이픈으로 새로운 실험번호(최대48자)를 만들고 `/run/{번호}`를 엽니다.
2. 같은 번호 아래 링크를 한 번씩 열어 응답 여부, requestId, generatedAt, 웹 도구의 Crawled 정보를 기록합니다.
3. `/observations/{번호}`를 일반 HTTPS로 읽고 도착 기록과 비교합니다. 관측 조회 자체는 기록하지 않습니다.
4. 독립된 두 번째 번호로 순서를 바꿔 재현합니다. 직접 open과 링크 click은 별도로 기록합니다.

| 경로                                          | 변경 조건                                                |
| --------------------------------------------- | -------------------------------------------------------- |
| html / text / json                            | 같은 가상 상품 데이터의 Content-Type 및 표현             |
| wallet / 지갑 / query?q=wallet / query?q=지갑 | ASCII·한글 경로와 쿼리                                   |
| redirect                                      | 같은 실행의 html로302이동                                |
| delay1 / delay5 / delay15                     | 응답 생성 전 고정1/5/15초 대기                           |
| large64 / large256                            | 전체 UTF-8 본문64/256KiB, 앞 데이터와 뒤 END-MARKER 비교 |
| cache                                         | public,max-age=300 헤더. CDN 캐시 저장을 강제하지 않음   |
| noindex                                       | X-Robots-Tag:noindex,follow                              |
| javascript                                    | 브라우저 JavaScript만 상품 데이터를 화면에 표시          |

기본은 no-store이며 모든 응답에 서버 생성 requestId가 있습니다. 표시된 문서가 과거인지 판정할 때 서버 기록과 이 번호를 비교합니다. 각 경로 이름도 데이터에 포함되므로 바이트 단위 동일 비교는 아닙니다.

## 관측의 한계

received는 Worker 도착, prepared는 응답 생성 완료입니다. prepared가 있어도 웹 읽기 클라이언트가 수신·파싱에 성공했다고 볼 수 없습니다. 기록이 없으면 Worker 도달을 확인하지 못한 것이며 Cloudflare 앞단 차단과 도구 내부 거절을 이것만으로 구별하지는 못합니다.

User-Agent는 chatgpt-user/oai-searchbot/browser/other로만 분류하며 인증된 신원이나 클라이언트 원본을 증명하지 않습니다. IP·쿠키·토큰·전체 UA·자유 쿼리는 저장하지 않습니다. 공개 관측 기록은 최대128개/24시간이며 많은 요청이 들어오면 앞 기록이 사라질 수 있습니다. 관측 URL에 개인정보를 넣지 마세요.

새 링크 하나가 실패했다는 사실만으로 JSON·한글·크기 등이 원인이라고 결론 내리지 않습니다. 기준 HTML도 실패하면 그 실행에서는 내용별 한계를 비교할 수 없습니다. 검색 사본 갱신은 보장하지 않습니다.
