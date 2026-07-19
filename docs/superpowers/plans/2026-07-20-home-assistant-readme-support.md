# Home Assistant README Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document verified Home Assistant support and provide the exact MCP connection steps in README.

**Architecture:** Add one static app-specific section outside the generated Workers chart markers. Keep the wording aligned with the existing Claude setup guide and link to Home Assistant's official MCP integration documentation.

**Tech Stack:** GitHub-flavored Markdown, Prettier, Vitest, GitHub Actions

---

### Task 1: Add the Home Assistant connection guide

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the supported-app introduction**

Replace:

```markdown
ChatGPT, Claude, Grok 같은 AI 앱에서 바로 연결해 사용할 수 있습니다.
```

with:

```markdown
ChatGPT, Claude, Home Assistant, Grok 같은 AI 앱에서 바로 연결해 사용할 수 있습니다.
```

- [ ] **Step 2: Add the dedicated Home Assistant section**

Insert the following section between Claude Code and Grok:

```markdown
### Home Assistant

> Home Assistant Core 2026.7.1에서 MCP 도구 40개를 모두 정상적으로 불러오는 것을 확인했습니다.

1. Home Assistant에서 **Settings** → **Devices & services**로 이동
2. **Add Integration**을 선택하고 **Model Context Protocol**을 검색
3. 서버 URL 입력: `https://mcp.aka.page`
4. 연동을 마친 뒤 사용할 대화 에이전트가 MCP 도구를 사용하도록 설정

참고: [Home Assistant Model Context Protocol 통합 가이드](https://www.home-assistant.io/integrations/mcp)

<br>
```

- [ ] **Step 3: Verify placement and required text**

Run:

```bash
rg -n 'Home Assistant|2026\.7\.1|https://mcp\.aka\.page|home-assistant\.io/integrations/mcp|WORKERS_INVOCATIONS_CHART' README.md
```

Expected: the Home Assistant section contains every required value and appears after `WORKERS_INVOCATIONS_CHART:END`.

- [ ] **Step 4: Verify README formatting**

Run: `npx prettier --check README.md`

Expected: README passes Prettier without changes.

- [ ] **Step 5: Verify chart updates preserve static README content**

Run: `npm test -- tests/scripts/workers-chart-helpers.test.ts`

Expected: the complete chart update test file passes.

- [ ] **Step 6: Run the repository check suite**

Run: `npm run check`

Expected: format, ESLint, Biome, type checking, and all tests pass.

- [ ] **Step 7: Commit the README guide**

```bash
git add README.md
git commit -m "docs: Home Assistant 연결 안내 추가"
```

### Task 2: Integrate, push, and verify GitHub

**Files:**
- Integrate: branch `fix/ha-mcp-user-context-schema` into local `main`
- Publish: GitHub `main`

- [ ] **Step 1: Fast-forward local main**

From `/Users/hm/Documents/personal-agent/workspaces/daiso-mcp` run:

```bash
git fetch --prune origin
git merge --ff-only fix/ha-mcp-user-context-schema
```

Expected: local `main` contains the README design, plan, and guide commits without a merge commit.

- [ ] **Step 2: Re-run the README checks on main**

Run:

```bash
npx prettier --check README.md
npm test -- tests/scripts/workers-chart-helpers.test.ts
```

Expected: both checks pass on the integrated branch.

- [ ] **Step 3: Push main**

Run: `git push origin main`

Expected: the push succeeds without force.

- [ ] **Step 4: Verify GitHub Actions**

Use `gh run list --commit <pushed-sha>` and watch CI, Coverage, CodeQL, and Cloudflare deployment to completion.

Expected: every required workflow concludes with `success`.

- [ ] **Step 5: Verify the published README**

Fetch the GitHub-rendered README source through `gh api` and confirm the Home Assistant heading, version, server URL, and official guide link are present.

Expected: all four values are visible from `origin/main` and the local worktree is clean.
