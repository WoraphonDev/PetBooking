// `pnpm --filter @app/db db:migrate` — applies every committed migration (incl. custom SQL) to DATABASE_URL.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  console.warn("migrations applied");
} finally {
  await sql.end();
}
