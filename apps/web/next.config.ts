import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@app/contracts", "@app/domain", "@app/server", "@app/db"],
};

export default withNextIntl(nextConfig);
