---
name: daiso-cli
description: Use this when a user wants to search Daiso/다이소, convenience stores/편의점, marts, Olive Young/올리브영, Megabox/메가박스, Lotte Cinema/롯데시네마, or CGV data through the Daiso project. Prefer the daiso CLI for direct execution, use the MCP endpoint when the host app supports remote MCP, and choose commands for products, stores, inventory/재고, movies, showtimes, seats, health checks, and raw JSON output.
---

# Daiso CLI

Use this skill to operate the Daiso MCP project through `npx daiso` and the public MCP endpoint.

## Core Rule

CLI를 우선 사용한다. The CLI is the most reliable path when you can run shell commands. Use the MCP endpoint when the user is configuring an AI app or explicitly asks for MCP connection details.

## Quick Checks

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
npx daiso gs25-products 콜라 --limit 10 --json
npx daiso gs25-stores 강남 --limit 10 --json
npx daiso gs25-inventory 오감자 --storeKeyword 강남 --storeLimit 10 --json
npx daiso seveneleven-products 삼각김밥 --size 10 --json
npx daiso seveneleven-stores "안산 중앙역" --limit 10 --json
npx daiso emart24-products 커피 --pageSize 10 --json
npx daiso lottemart-products 콜라 --storeName 강변점 --area 서울 --json
npx daiso get /api/cgv/movies --playDate <YYYYMMDD> --theaterCode <theaterCode> --json
```

For more command selection examples, read `references/cli-command-map.md`.

## Multi-step Korean request patterns

- Convenience store product near a place: if the request has both product and location, prefer inventory lookup over product-only search. Example: `npx daiso gs25-inventory 콜라 --storeKeyword 강남역 --storeLimit 10 --json`.
- Seven-Eleven inventory currently uses the raw GET fallback. Example: `npx daiso get /api/seveneleven/inventory --keyword 핫식스 --storeKeyword "안산 중앙역" --storeLimit 10 --json`.
- Daiso inventory by product name: search products first, keep the selected product ID, then run inventory with a store keyword. 위치가 없으면 ask the user for an area or store before checking inventory.
- Cinema movies and timetable: find the theater first when the theater code is unknown, then call movies or timetable. If the user says today or omits a date, compute today in KST as `YYYYMMDD`; do not copy example dates.

## Workflow

1. Identify the target service from the user request: Daiso, GS25, Seven-Eleven, CU, Emart24, Lotte Mart, Olive Young, Megabox, Lotte Cinema, or CGV.
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
