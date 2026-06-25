import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  reactCompiler: true,
  cacheComponents: true,
  logging: {
    browserToTerminal: true,
  },
  serverExternalPackages: ["better-auth"],
};

export default nextConfig;
