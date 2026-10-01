// Process-wide DB handle + transaction helper. Tests inject a PGlite db with setDb().
import { createDb } from "@app/db/client";
import type * as schema from "@app/db/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { RequestContext } from "./context.ts";

type Schema = typeof schema;
export type AppDb = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Executor = AppDb | Tx;

let current: AppDb | null = null;

export function getDb(): AppDb {
  if (!current) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    current = createDb(url) as unknown as AppDb;
  }
  return current;
}

/** Tests only: use this db instead of DATABASE_URL (null = reset). */
export function setDb(db: AppDb | null): void {
  current = db;
}

/** One transaction per write service (state + booking_event + audit_log + outbox together). */
export function withTx<T>(_ctx: RequestContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction((tx) => fn(tx));
}
