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
  serverExternalPackages: ["better-auth", "pg-boss"],
};

export default nextConfig;
