import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Colocated tests stay within T-0018's allowed_paths; see Q-0012.
export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: { include: ["src/services/health/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 120_000 },
});
