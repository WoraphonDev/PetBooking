// Test database for every package: PGlite (WASM Postgres) + btree_gist + ALL migrations in journal order (incl. custom SQL).
// Migrations run once per process; each createTestDb() clones the migrated data dir (fast, fully isolated).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema/index";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

type Journal = { entries: { idx: number; tag: string }[] };

export function migrationFiles(): string[] {
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", MIGRATIONS), "utf8")) as Journal;
  return [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => `${e.tag}.sql`);
}

export async function applyMigrations(pg: PGlite): Promise<number> {
  let n = 0;
  for (const file of migrationFiles()) {
    const sqlText = readFileSync(new URL(file, MIGRATIONS), "utf8");
    for (const stmt of sqlText.split("--> statement-breakpoint")) {
      if (stmt.trim()) {
        await pg.exec(stmt);
        n++;
      }
    }
  }
  return n;
}

let template: Promise<File | Blob> | null = null;
async function migratedTemplate(): Promise<File | Blob> {
  template ??= (async () => {
    const pg = new PGlite({ extensions: { btree_gist } });
    await applyMigrations(pg);
    const dump = await pg.dumpDataDir("none");
    await pg.close();
    return dump;
  })();
  return template;
}

export type TestDb = { db: PgliteDatabase<typeof schema>; pg: PGlite; close: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { btree_gist }, loadDataDir: await migratedTemplate() });
  const db = drizzle(pg, { schema });
  return { db, pg, close: () => pg.close() };
}
