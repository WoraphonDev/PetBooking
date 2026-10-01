import { defineConfig } from "drizzle-kit";

// ห้ามใช้ `drizzle-kit push` — ทุกการเปลี่ยน schema ต้องเป็น migration ที่ commit (ดู AGENTS.md)
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
