# Inngest Coding Agent Resources

> **Purpose**: This document gives coding agents (Devin, Claude Code, Cursor, etc.) everything needed to write, test, and debug Inngest functions in the VectorMatch project.

---

## Quick Reference

| Resource | URL |
|----------|-----|
| Inngest Docs (web) | <https://www.inngest.com/docs> |
| LLM-friendly docs index | <https://www.inngest.com/llms.txt> |
| **Full docs as single file** | <https://www.inngest.com/llms-full.txt> |
| LLM integration context | <https://www.inngest.com/llm-context.md> |
| AgentKit docs | <https://agentkit.inngest.com> |
| AgentKit llms-full | <https://agentkit.inngest.com/llms-full.txt> |
| Dev Server MCP endpoint | `http://127.0.0.1:8288/mcp` |

---

## Project Inngest Setup

### File Map

| File | Role |
|------|------|
| `src/inngest/client.ts` | Typed Inngest client (`VectorMatchEvents`) |
| `src/inngest/functions.ts` | All background functions (seeders, poller, cleanup) |
| `src/inngest/index.ts` | Barrel exports |
| `src/app/api/inngest/route.ts` | Next.js App Router serve handler |
| `.env` | Local dev variables (`INNGEST_DEV=1`) |

### Running Locally

```bash
# Terminal 1 — Next.js dev server (auto-connects to local Inngest Dev Server)
npm run dev

# Terminal 2 — Inngest Dev Server UI at http://localhost:8288
npm run inngest:dev

# Or via Docker
npm run inngest:dev:docker
```

### Environment Variables

| Variable | Local | Production |
|----------|-------|------------|
| `INNGEST_DEV` | `1` | omit |
| `INNGEST_EVENT_KEY` | dummy | from Inngest Cloud dashboard |
| `INNGEST_SIGNING_KEY` | dummy | from Inngest Cloud dashboard |
| `INNGEST_SERVE_ORIGIN` | omit | `https://vectormatch.dev` |

### Syncing (Self-Hosted / Coolify)

Unlike Vercel, Coolify does not have an Inngest integration. After each deploy, trigger a sync manually or via CI:

```bash
curl -X PUT https://vectormatch.dev/api/inngest --fail-with-body
```

---

## Writing Functions — Patterns for Coding Agents

### 1. Always wrap domain logic in `step.run()`

```ts
export const myFunction = inngest.createFunction(
  { id: "my-function", triggers: [{ event: "app/my.event" }] },
  async ({ event, step }) => {
    // ✅ Durable — retried independently, checkpointed
    const result = await step.run("step-name", async () => {
      return await someDomainLogic(event.data.id);
    });

    // ❌ Never do this — not durable, not retriable
    // const result = await someDomainLogic(event.data.id);

    return result;
  }
);
```

### 2. Send events from within functions

```ts
await step.sendEvent("name-for-trace", {
  name: "job/ingested",
  data: { jobId: "...", atsSource: "greenhouse" },
});
```

### 3. Cron triggers for scheduled jobs

```ts
{ triggers: [{ cron: "0 0 * * 1" }] } // Monday 00:00 UTC
```

### 4. Throttle / rate-limit

```ts
{
  throttle: { limit: 1, period: "5s", key: "event.data.companyId" },
}
```

### 5. Parallel steps

```ts
const [a, b] = await Promise.all([
  step.run("fetch-a", async () => fetchA()),
  step.run("fetch-b", async () => fetchB()),
]);
```

### 6. AI orchestration with `step.ai.wrap()`

VectorMatch uses the Vercel AI SDK. Wrap calls for observability:

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const { text } = await step.ai.wrap("summarize-job", generateText, {
  model: openai("gpt-4o-mini"),
  prompt: "Summarize this job posting...",
});
```

For direct provider access (offloaded to Inngest infra, saving serverless cost):

```ts
const response = await step.ai.infer("call-openai", {
  model: step.ai.models.openai({ model: "gpt-4o" }),
  body: {
    messages: [{ role: "user", content: "..." }],
  },
});
```

---

## Debugging with the Inngest CLI

When a function fails, use the CLI to inspect real execution traces instead of guessing.

```bash
# Install the CLI locally
npx inngest-cli@latest

# Get a run trace
npx inngest-cli@latest api --prod get-function-trace <run_id> --include-output

# Get runs from an event
npx inngest-cli@latest api --prod get-event-runs <event_id> --include-output --limit 5

# Invoke a function locally against the dev server
npx inngest-cli@latest api invoke-function vectormatch phalanx-poller \
  --data '{"companyId": "test-123"}'
```

Set `INNGEST_API_KEY` (environment-scoped key from Inngest Cloud) so the agent can run these commands.

---

## Dev Server MCP (Model Context Protocol)

The local Dev Server exposes an MCP server at:

```
http://127.0.0.1:8288/mcp
```

Connect Claude Code, Cursor, or another MCP-compatible agent to:

- List registered functions
- Send test events
- Invoke functions
- Inspect run status

This is configured in `.devin/config.json` under `mcpServers.inngest`.

---

## Event Catalog (Module B)

| Event Name | Emitted By | Handled By | Purpose |
|------------|-----------|------------|---------|
| `seeder/hn.run` | cron | `hnAlgoliaSeeder` | Trigger HN seeder manually |
| `seeder/hn.completed` | `hnAlgoliaSeeder` | — | Telemetry / chaining |
| `seeder/resolve-custom-url` | `hnAlgoliaSeeder` | `customUrlResolver` | Resolve non-ATS URLs |
| `seeder/bigquery.run` | cron | `bigQuerySeeder` | Trigger BQ seeder manually |
| `poller/run` | cron / manual | `phalanxPoller` | Trigger ATS poll sweep |
| `poller/tier-recalc` | cron | `tierRecalc` | Daily tier rebucket |
| `poller/stale-cleanup` | cron | `staleCleanup` | Mark old jobs stale/gone |
| `job/ingested` | `phalanxPoller` | `jobIngestedHandler` | Handoff to Module C 3-Gate |

---

## Gotchas

1. **Never call the DB or external APIs outside `step.run()`** — you lose retries and observability.
2. **Import domain logic lazily inside the handler** to avoid loading heavy modules at discovery time.
3. **Self-hosted sync**: After every deploy, run `curl -X PUT https://<host>/api/inngest`.
4. **Dev Server keys**: Use dummy values locally — the dev server does not validate them.
5. **AI SDK binding**: When using `step.ai.wrap()` with SDKs that need instance context (e.g. Anthropic), bind the method first:
   ```ts
   const createCompletion = anthropic.messages.create.bind(anthropic.messages);
   await step.ai.wrap("call", createCompletion, { ... });
   ```
