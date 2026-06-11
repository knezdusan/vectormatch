---
name: playwright-e2e
description: Write, debug, and configure Playwright E2E tests in this project. Use when creating end-to-end tests, exploring the app via browser automation, debugging auth flows, or integrating with the AI-assisted test workflow. Covers both the standard test runner and the MCP-powered browser exploration tools.
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
  - mcp_call_tool
---

You are about to work with Playwright E2E testing in this Next.js 16.2 + React 19 + Better Auth project.

## Three Playwright tools in this project

This project uses **two** Playwright products. A third exists but is not installed:

| Tool | Package | Purpose | When to use |
|---|---|---|---|
| **Playwright Test** | `@playwright/test` | Standard E2E test framework. Runs headless/headed browsers, asserts DOM state, generates reports. | Writing and running automated test suites. CI integration. Regression testing. |
| **Playwright MCP** | `@playwright/mcp@latest` | MCP server exposing browser tools (`browser_navigate`, `browser_click`, `browser_snapshot`) to Devin. | AI-assisted exploration: let Devin visit pages, describe UI, find selectors, or verify flows before writing tests. |
| **Playwright CLI** | `@playwright/cli` *(not installed)* | Shell-command based browser automation (`playwright-cli open`, `click`, `screenshot`). Lower token cost. Daemon architecture. | *Not installed.* If needed later, it provides cheaper agentic loops than MCP. Install with `npm install -g @playwright/cli` and run `playwright-cli install --skills`. |

**Rule of thumb:** Use **Playwright Test** for repeatable test code. Use **Playwright MCP** for one-off exploration when you need Devin to "look at" the page before writing a test.

## Step 1 — Read the actual project configuration

Before writing or modifying E2E tests, read these files:

- `playwright.config.ts` — testDir, projects (5 browsers), baseURL, webServer, artifacts, timeouts
- `package.json` — `test:e2e`, `test:e2e:ui`, `test:e2e:debug`, `test:e2e:headed` scripts
- `e2e/seed.spec.ts` — smoke test verifying the app is reachable
- `.devin/config.json` — MCP server registration for `playwright` (MCP-based browser tools)

Do not assume configuration — always verify from source.

## Step 2 — Project-specific conventions

### Test file location
- All E2E tests live in `e2e/`
- Name files `*.spec.ts`
- Do not place E2E tests in `src/` or `tests/` — those are for Vitest unit tests

### Base URL and dev server
- `baseURL` is `http://localhost:3000` — use relative paths: `page.goto('/auth')`
- The dev server auto-starts via `webServer` config in `playwright.config.ts`
- Do not hardcode `http://localhost:3000` in test files

### Cross-browser projects
Tests run against 5 projects by default:
1. `chromium` (Desktop Chrome)
2. `firefox` (Desktop Firefox)
3. `webkit` (Desktop Safari)
4. `Mobile Chrome` (Pixel 5)
5. `Mobile Safari` (iPhone 12)

Use `--project=chromium` during development to iterate faster. Run the full suite before committing.

### Failure artifacts
- Screenshots: saved to `e2e/test-results/` on failure only
- Videos: recorded on first retry
- Traces: captured on first retry
- HTML report: generated in `e2e/playwright-report/`

All artifacts are `.gitignore`d. Open the report locally with `npx playwright show-report e2e/playwright-report`.

## Step 3 — Better Auth and rate-limit awareness

### Auth endpoints are rate-limited
Better Auth applies strict rate limits (see `src/lib/auth.ts`):
- `/api/auth/sign-in/email` — **3 attempts per 10 seconds**
- `/api/auth/sign-up/email` — **3 attempts per 10 seconds**
- `/api/auth/request-password-reset` — **3 attempts per 60 seconds**

**Do not** write tests that repeatedly log in through the UI. Prefer these patterns:

#### Pattern A: API-based session creation (recommended)
Use Better Auth's API to create a session programmatically before tests:
```ts
// In a fixture or global setup
const response = await request.post('/api/auth/sign-in/email', {
  data: { email: 'test@example.com', password: 'password123' }
});
const cookies = response.headers()['set-cookie'];
// Use cookies in subsequent requests
```

#### Pattern B: Storage state (for UI tests)
Log in once via API, save storage state, then reuse across tests:
```ts
// global-setup.ts
import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Use API or direct DB manipulation to establish session
  await page.context().storageState({ path: './e2e/playwright/.auth/user.json' });
  await browser.close();
}

export default globalSetup;
```

Then reference in `playwright.config.ts`:
```ts
use: {
  storageState: './e2e/playwright/.auth/user.json',
}
```

### Protected routes
- `/dashboard` redirects unauthenticated users to `/auth`
- Always verify session state before asserting dashboard content

## Step 4 — Next.js 16 App Router considerations

### Hydration errors
React 19 + Next.js 16 can produce hydration mismatches. The seed test already checks for console errors containing "hydrat". When writing E2E tests:
- Monitor `page.on('console')` for errors
- Use `page.waitForSelector` with appropriate timeouts after navigation
- Do not assert immediately after `page.goto()` — wait for hydration

### Server Components
Pages may render Server Components first, then hydrate client-side. Locators that work in Vitest (JSDOM) may differ from real browser behavior. Always verify selectors in a real browser.

### Dark mode
The app uses dark mode by default. Screenshots and visual assertions should expect dark-themed UI. Do not write tests that depend on light-mode colors.

## Step 5 — Using Playwright MCP for exploration

When you need Devin to explore the app before writing a test, use the MCP tools configured in `.devin/config.json`:

### Example prompts to Devin
- "Navigate to `/auth` and describe the login form fields and their refs"
- "Click the 'Sign Up' tab and list all visible inputs"
- "Submit the form with empty fields and report what validation messages appear"

### What Devin will call
- `browser_navigate` → loads the page
- `browser_snapshot` → returns accessibility tree with element refs
- `browser_click` / `browser_type` → interacts with elements by ref

### Important: MCP runs headed by default
A real Chrome window will open. This is useful for watching the exploration, but be aware it steals focus. Use `--headless` in the MCP server args if you want background execution:
```json
"args": ["-y", "@playwright/mcp@latest", "--headless"]
```

## Step 6 — Writing tests manually

For standard test cases, write Playwright tests directly using `@playwright/test`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Auth page', () => {
  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });
});
```

### Best practices
- Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors — resilient to style changes
- Use `test.describe` to group related scenarios
- Keep tests independent — no shared state between tests
- Use `test.beforeEach` for common setup (e.g., navigating to a base page)

## Step 7 — Run and verify

```bash
# Run all E2E tests (all browsers)
npm run test:e2e

# Run only Chromium during development
npx playwright test --project=chromium

# Interactive UI mode (great for debugging)
npm run test:e2e:ui

# Debug a specific test
npm run test:e2e:debug -- e2e/auth.spec.ts

# Headed mode (see the browser)
npm run test:e2e:headed

# Show HTML report
npx playwright show-report e2e/playwright-report
```

Fix any failures before considering the task complete.
