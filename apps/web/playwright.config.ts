// E2E (01 §5): Playwright against `next start` with LINE_FAKE=1 and the dev seed.
// Uses the Chromium already installed in the Playwright cache — never `playwright install`.
// Database: E2E_DATABASE_URL (a disposable test Postgres) is migrated and seeded before the server starts;
// without it the server runs with no DATABASE_URL, which is enough for pages that read nothing (e2e/smoke.spec.ts).
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const databaseUrl = process.env.E2E_DATABASE_URL;

const prepareDb = databaseUrl ? "pnpm --filter @app/db db:migrate && pnpm --filter @app/server db:seed && " : "";

export default defineConfig({
  testDir: "./e2e",
  // outside biome's scope (root biome.json ignores node_modules) so `pnpm verify` doesn't lint run artifacts
  outputDir: "node_modules/.cache/e2e/test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${prepareDb}pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      LINE_FAKE: "1",
      APP_BASE_URL: baseURL,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
  },
});
