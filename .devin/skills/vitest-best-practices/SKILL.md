---
name: vitest-best-practices
description: Write, debug, and configure Vitest tests in this project. Use when writing new tests, fixing test failures, adding mocks, or setting up test infrastructure. Reads actual project config files first and fetches latest Vitest docs to stay current.
triggers:
  - user
  - model
allowed-tools:
  - read
  - grep
  - glob
  - webfetch
  - exec
  - edit
  - write
---

You are about to work with Vitest in this Next.js 16.2 + React 19 project.

## Step 1 — Read the actual project configuration

Before writing any test code, read these files to understand the exact setup:

- `vitest.config.mts` — DOM environment, plugins, coverage provider, exclusions
- `vitest.setup.ts` — global mocks already in place (Next.js navigation, headers, cookies)
- `package.json` — exact dependency versions and available test scripts

Do not assume any configuration — always verify from the source files.

## Step 2 — Fetch the latest Vitest documentation

Vitest 4.x may have APIs and patterns that differ from training data. Fetch only what is relevant to the current task:

- API reference: https://vitest.dev/api/
- Configuration reference: https://vitest.dev/config/
- Vitest UI: https://vitest.dev/guide/ui.html
- @testing-library/react: https://testing-library.com/docs/react-testing-library/api

## Step 3 — Apply these project-specific rules

### Next.js 16 async APIs (critical breaking change)
`useParams`, `useSearchParams`, and `cookies()` are async in Next.js 16. The setup file mocks them correctly with async functions. Always check `vitest.setup.ts` before re-mocking these.

### File conventions
- Name test files `*.test.ts` / `*.test.tsx` or `*.spec.ts` / `*.spec.tsx`
- Place tests alongside source files or in a sibling `__tests__/` directory
- `describe`, `it`, `expect` are global — no import needed (globals enabled in config)

### Mock discipline
- Reusable mocks belong in `vitest.setup.ts`, not scattered inline across test files
- `next/navigation` and `next/headers` are already mocked globally — inspect the setup file before adding duplicates
- Use `vi.mock()` for module-level mocks, `vi.fn()` for per-test function stubs

### Path aliases
`@/*` imports resolve correctly in tests via `vite-tsconfig-paths` — no special handling needed.

## Step 4 — Run and verify

After writing tests, run them and confirm they pass:

```bash
npm run test          # watch mode (development)
npm run test:ui       # visual UI
npm run test:coverage # coverage report (text, json, html output)
```

Fix any failures before considering the task complete.
