import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  // Module E — standalone output for Docker/Coolify deployment.
  // Produces a minimal .next/standalone directory with only the runtime files
  // and dependencies needed to run `node server.js` in a container.
  output: "standalone",
  logging: {
    browserToTerminal: true,
  },
  serverExternalPackages: [
    "better-auth",
    "pg-boss",
    // D27: AI SDK packages must be external — Turbopack bundling causes
    // "r is not a constructor" runtime errors when generateObject/openai()
    // are invoked from pg-boss worker callbacks in the Next.js server.
    // Previously these ran in a separate Inngest Docker container (standalone
    // Node.js process) where the SDK was loaded natively. Now that pg-boss
    // runs in-process, the SDK must be external to avoid Turbopack ESM/CJS
    // interop issues.
    "ai",
    "@ai-sdk/openai",
    "openai",
  ],
};

export default nextConfig;
