import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  cacheComponents: true,
  logging: {
    browserToTerminal: true,
  },
  serverExternalPackages: ["better-auth"],
  // Disable font optimization to prevent build-time network failures
  optimizeFonts: false,
};

export default nextConfig;
