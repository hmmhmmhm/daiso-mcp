# Home Assistant `userContext` Schema Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 40 production MCP tool schemas convertible by Home Assistant 2026.7.1 without narrowing the JSON values accepted by `userContext`.

**Architecture:** Replace the untyped loose object with one recursive Zod JSON-value schema. Keep the schema next to the only tool that uses it, and add a regression test against the actual JSON Schema emitted from the registered tool.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 4, MCP SDK, GitHub Actions, Cloudflare Workers

---

### Task 1: Reproduce and fix the incompatible schema

**Files:**
- Modify: `tests/services/feedback/index.test.ts`
- Modify: `src/services/feedback/tools/submitDeveloperRequest.ts`

- [ ] **Step 1: Add the failing Home Assistant compatibility test**

Add the Zod import and these tests to `tests/services/feedback/index.test.ts`:

```typescript
import * as z from 'zod';

it('Home Assistant가 변환할 수 있는 userContext JSON Schema를 생성한다', () => {
  const service = createFeedbackService();
  const tool = service.getTools()[0];
  if (!tool) throw new Error('submit_developer_request 도구가 없습니다.');
  const jsonSchema = z.toJSONSchema(z.object(tool.metadata.inputSchema)) as {
    properties?: Record<string, { additionalProperties?: unknown }>;
  };

  expect(jsonSchema.properties?.userContext?.additionalProperties).toEqual({
    $ref: expect.stringMatching(/^#\/\$defs\//),
  });
});

it('userContext에 중첩 JSON 값을 허용한다', () => {
  const service = createFeedbackService();
  const tool = service.getTools()[0];
  if (!tool) throw new Error('submit_developer_request 도구가 없습니다.');
  const inputSchema = z.object(tool.metadata.inputSchema);
  const userContext = {
    count: 1,
    ratio: 1.5,
    active: true,
    note: null,
    request: { path: '/mcp' },
    tags: ['home-assistant', 2026],
  };

  expect(
    inputSchema.parse({
      title: 'Home Assistant 연결 실패',
      description: '도구 스키마를 변환하지 못합니다.',
      userContext,
    }).userContext,
  ).toEqual(userContext);
});
```

- [ ] **Step 2: Run the target test and verify RED**

Run: `npm test -- tests/services/feedback/index.test.ts`

Expected: the compatibility test fails because `additionalProperties` is `{}` instead of a `$ref`. The existing tests and the nested JSON preservation test pass.

- [ ] **Step 3: Implement the recursive JSON-value schema**

Add this schema below the imports in `src/services/feedback/tools/submitDeveloperRequest.ts`:

```typescript
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.int(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
```

Replace the `userContext` field with:

```typescript
userContext: z
  .record(z.string(), jsonValueSchema)
  .optional()
  .describe('추가 컨텍스트 JSON'),
```

- [ ] **Step 4: Run the target test and verify GREEN**

Run: `npm test -- tests/services/feedback/index.test.ts`

Expected: all tests in the file pass, including integer, floating-point, nested object, array, boolean, and `null` values.

- [ ] **Step 5: Commit the regression fix**

```bash
git add src/services/feedback/tools/submitDeveloperRequest.ts tests/services/feedback/index.test.ts
git commit -m "fix: Home Assistant MCP 스키마 호환성 개선"
```

### Task 2: Run repository-level verification

**Files:**
- Verify: `src/services/feedback/tools/submitDeveloperRequest.ts`
- Verify: `tests/services/feedback/index.test.ts`

- [ ] **Step 1: Check formatting for changed code**

Run: `npx prettier --check src/services/feedback/tools/submitDeveloperRequest.ts tests/services/feedback/index.test.ts`

Expected: both files pass formatting checks.

- [ ] **Step 2: Run the repository check suite**

Run: `npm run check`

Expected: format, ESLint, Biome, type checking, and all tests pass.

- [ ] **Step 3: Run 100% coverage**

Run: `npm run test:coverage`

Expected: statements, branches, functions, and lines are all 100%.

- [ ] **Step 4: Build package and OpenAPI output**

Run: `npm run build`

Expected: TypeScript compilation and OpenAPI generation complete without errors.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check HEAD~1 && git status --short --branch && git log --oneline -4`

Expected: no whitespace errors, no uncommitted source changes, and the schema fix commit follows the design and plan commits.

### Task 3: Integrate, deploy, and verify production

**Files:**
- Integrate: branch `fix/ha-mcp-user-context-schema` into local `main`
- Deploy: existing GitHub Actions workflows

- [ ] **Step 1: Fast-forward local main to the verified branch**

From `/Users/hm/Documents/personal-agent/workspaces/daiso-mcp` run:

```bash
git merge --ff-only fix/ha-mcp-user-context-schema
git status --short --branch
```

Expected: local `main` points to the verified fix and is ahead of `origin/main` only by the new commits.

- [ ] **Step 2: Push main**

Run: `git push origin main`

Expected: the push succeeds without force and triggers the existing CI/CD workflows.

- [ ] **Step 3: Verify GitHub Actions**

Use `gh run list --commit <pushed-sha>` to identify CI, Coverage, CodeQL, and Cloudflare deployment runs, then watch every required run to completion.

Expected: CI, Coverage, CodeQL, and Deploy to Cloudflare Workers all conclude with `success`.

- [ ] **Step 4: Verify production health**

Run: `curl -sS -o /dev/null -w '%{http_code}\n' https://mcp.aka.page/health`

Expected: HTTP `200`.

- [ ] **Step 5: Verify all live schemas with Home Assistant's converter**

Initialize an MCP session against `https://mcp.aka.page/mcp`, fetch `tools/list`, and pass every `inputSchema` to `voluptuous-openapi==0.4.1`.

Expected: `live_tools=40 valid=40 invalid=0`. Confirm that `submit_developer_request.userContext.additionalProperties` is no longer `{}` and that its reference resolves for nested JSON values.
