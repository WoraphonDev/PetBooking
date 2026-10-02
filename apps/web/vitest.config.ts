// Next.js needs tsconfig `jsx: "preserve"`; tests transform .tsx themselves with the React automatic runtime (Q-0020).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"] },
});
