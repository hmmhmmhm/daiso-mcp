---
name: daiso-cli
description: Use this when a user wants to search Daiso/다이소, compare product price candidates, nearby restaurants/cafes/음식점/카페, convenience stores/편의점, marts, Olive Young/올리브영, Megabox/메가박스, Lotte Cinema/롯데시네마, or CGV data through the Daiso project. Honor explicit no-install requests with remote MCP first; otherwise prefer the daiso CLI for direct execution, use the MCP endpoint when the host app supports remote MCP, and choose commands for products, stores, inventory/재고, compare, places, movies, showtimes, seats, health checks, and raw JSON output.
version: 1.0.6
metadata:
  openclaw:
    requires:
      bins:
        - npx
    install:
      - kind: node
        package: daiso
        bins:
          - daiso
    homepage: https://github.com/hmmhmmhm/daiso-mcp
---

# Daiso CLI

Use this skill to operate the Daiso MCP project through `npx daiso` and the public MCP endpoint.

## 설치 없이 첫 조회

사용자가 "설치 없이", "무설치"를 명시하면 로컬 CLI·스킬 설치 없이 원격 조회를 먼저 실행합니다. 연결된 원격 MCP 도구가 있으면 `daiso_search_products`를 바로 호출합니다. 원격 MCP 클라이언트의 서버 주소는 `https://mcp.aka.page`입니다.

셸에서 직접 확인할 때는 아래 POST가 실제 MCP 도구 호출입니다. 이 공개 서버는 세션 없이 호출할 수 있으며 응답은 SSE의 `data:` JSON입니다. 범용 MCP 클라이언트 연결은 클라이언트가 initialize와 세션 절차를 처리합니다.

```bash
curl -fsS --max-time 20 'https://mcp.aka.page' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"daiso_search_products","arguments":{"query":"수납박스","pageSize":3}}}'
```

첫 조회 전에 `npx`, 패키지·스킬 설치, health/help, 전체 스키마나 도구 목록 탐색을 하지 않습니다. 위 예제의 검색어를 사용자 요청으로 바꾸고 조회 결과부터 제공합니다. 사용자 조건이나 호출 오류 때문에 필요한 경우에만 추가 안내를 읽습니다. 호출에 성공하면 추가 진단 없이 결과를 보여줍니다.

`GET https://mcp.aka.page/api/daiso/products?q=수납박스`는 같은 서비스의 REST 직접 조회입니다. GET만 가능한 환경에서는 사용할 수 있지만 MCP 도구를 호출했다고 설명하지 않습니다. HTTP·네트워크 오류만으로 로그인 필요나 서버 장애를 단정하지 않고 실제 오류와 실행 환경을 확인합니다.

## Core Rule

무설치 요청이 아니고 CLI 사용이 허용된 환경에서는 CLI를 우선 사용한다. The CLI is the preferred path when you can run shell commands and package execution is allowed. Use the MCP endpoint when the user is configuring an AI app or explicitly asks for MCP connection details.

## Quick Checks (오류 진단이 필요할 때만)

```bash
npx daiso health
npx daiso url
npx daiso help
```

MCP server URL:

```text
https://mcp.aka.page
```

Use `--json` when the user needs structured data, when comparing results, or when another tool will consume the output.

## Common Commands

```bash
npx daiso products 수납박스 --json
npx daiso stores 강남역 --limit 5 --json
npx daiso inventory 1034604 --keyword 강남역 --json
npx daiso display-location 1034604 04515 --json
npx daiso compare 콜라 --limit 3 --json
npx daiso places 강남역 --category cafe --limit 5 --json
npx daiso places 성수동 --keyword 브런치 --limit 5 --json
npx daiso get /api/feedback/requests --type bug --title "올리브영 재고 오류" --description "oliveyoung_check_inventory가 빈 결과를 반환합니다." --service oliveyoung --toolName oliveyoung_check_inventory --json
npx daiso gs25-products 콜라 --limit 10 --json
npx daiso gs25-stores 강남 --limit 10 --json
npx daiso gs25-inventory 오감자 --storeKeyword 강남 --storeLimit 10 --json
npx daiso seveneleven-products 삼각김밥 --size 10 --json
npx daiso seveneleven-stores "안산 중앙역" --limit 10 --json
npx daiso seveneleven-inventory 핫식스 --storeKeyword "안산 중앙역" --storeLimit 10 --json
npx daiso emart24-products 커피 --pageSize 10 --json
npx daiso cgv-movies --playDate <YYYYMMDD> --theaterCode <theaterCode> --json
npx daiso cgv-timetable --playDate <YYYYMMDD> --theaterCode <theaterCode> --json
```

For more command selection examples, read `references/cli-command-map.md`.

## Request Recipes

아래 CLI 레시피는 CLI 사용이 허용된 경우에만 적용합니다. 무설치 요청에서는 같은 조회를 원격 MCP 도구로 실행합니다.

- "콜라 어디가 싸?", "컵라면 가격 비교해줘": run `npx daiso compare <keyword> --json` first. Confirm stock or sale prices with service-specific inventory only when the user asks for store-level availability.
- "강남역 근처 카페", "성수동 브런치 음식점": run `npx daiso places <location> --category cafe|restaurant --json` or use `--keyword` for the food or mood. Do not ask which retail brand they mean.
- "다이소 핫식스 재고", "올리브영 두바이초콜릿 있어?": keep the named brand. Search that service first even if the product seems unusual for the brand, then suggest alternatives only after no results.
- "GS25 강남 오감자 재고": separate product and location. Search product candidates first when an item code is needed, then run inventory with `--storeKeyword`.
- "오늘 강남 CGV 시간표": compute today in KST as `YYYYMMDD`, find the theater if the code is unknown, then query timetable.
- "MCP가 오류나요", "개발자에게 개선 요청 보내줘": use `submit_developer_request` when MCP is available. In CLI-only environments, use `npx daiso get /api/feedback/requests --type bug|improvement|feature|docs --title "..." --description "..." --json`.
- If a command fails, retry once with narrower input. If it still fails, report the service, command, and condition instead of inventing results.
- If output contains `imageUrl`, preserve the full URL including query string when showing images.

## Multi-step Korean request patterns

- Convenience store product near a place: if the request has both product and location, prefer inventory lookup over product-only search. Example: `npx daiso gs25-inventory 콜라 --storeKeyword 강남역 --storeLimit 10 --json`.
- Cross-service price candidate comparison: if the user asks which service is cheaper without naming a brand, use `npx daiso compare <keyword> --json` first. This uses no new external API key and compares Daiso, GS25, Seven-Eleven, and Emart24 product search candidates.
- Nearby restaurants or cafes: use `npx daiso places <location> --category cafe|restaurant --json`. If the user gives a specific food or mood, use `--keyword`, for example `npx daiso places 성수동 --keyword 브런치 --json`.
- Seven-Eleven inventory: use `npx daiso seveneleven-inventory 핫식스 --storeKeyword "안산 중앙역" --storeLimit 10 --json`.
- Daiso inventory by product name: search products first, keep the selected product ID, then run inventory with a store keyword. 위치가 없으면 ask the user for an area or store before checking inventory.
- Cinema movies and timetable: find the theater first when the theater code is unknown, then call movies or timetable. If the user says today or omits a date, compute today in KST as `YYYYMMDD`; do not copy example dates.

## Workflow

1. Identify the target service from the user request: feedback/developer request, compare, Daiso, places/restaurants/cafes, GS25, Seven-Eleven, CU, Emart24, Lotte Mart, Olive Young, Megabox, Lotte Cinema, or CGV.
2. Choose a CLI command from the common commands or `references/cli-command-map.md`.
3. Add `--json` for machine-readable output or when summarizing multiple records.
4. If a CLI command is not available for the exact route, use `npx daiso get /api/... --json`.
5. If a command fails, run `npx daiso health` and retry with a narrower query or service-specific endpoint.

## Fallbacks

- npx 또는 Node.js를 사용할 수 없으면 do not invent results. Tell the user the CLI cannot run in the current environment and provide the MCP URL or equivalent `GET /api/...` path.
- For network failures, retry once with a narrower query, then report the failing service and command.
- For no results, preserve the command used and suggest a broader keyword or nearby area.
- Switch from CLI to MCP only when the user is configuring an AI app, the shell cannot run `npx`, or the host environment already exposes the MCP server.

## Output Handling

- Summarize only the fields the user needs: product name, price, store name, address, stock, movie title, showtime, seat count.
- Preserve IDs such as product IDs, store codes, theater codes, and movie codes when the user may need follow-up lookup.
- Mention when data comes from live external services and may change.
- In shell commands, quoted Korean strings are fine for values with spaces. URL-encode only when writing raw URLs.

## MCP Usage

For AI apps that support remote MCP, tell the user to connect:

```text
https://mcp.aka.page
```

For local shell work, prefer `npx daiso` because it gives direct CLI commands and JSON output without requiring MCP host configuration.
