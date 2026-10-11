import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
