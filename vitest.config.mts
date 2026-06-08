// vitest.config.mts

import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tsconfigPaths(), // Native mapping for Next.js paths (e.g., @/*)
    react(), // Fast React 19 compiler compatibility matching SWC/Turbopack
  ],
  test: {
    environment: "happy-dom",
    globals: true, // Avoid importing 'describe', 'it', 'expect' in every file
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["node_modules", ".next", "tests-e2e/**/*"], // Skip E2E Playwright tests
    coverage: {
      provider: "v8", // Out-of-the-box native V8 coverage is much faster than Istanbul
      reporter: ["text", "json", "html"],
    },
    // Add environment variables if needed
    env: {
      NODE_ENV: "test",
    },
  },
});
