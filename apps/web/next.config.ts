import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@app/contracts", "@app/domain", "@app/server", "@app/db"],
};

export default nextConfig;
