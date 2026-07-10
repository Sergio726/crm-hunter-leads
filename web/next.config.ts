import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontenido para Docker: genera .next/standalone con server.js
  output: "standalone",
};

export default nextConfig;
