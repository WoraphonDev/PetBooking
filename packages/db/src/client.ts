// Runtime DB client (postgres-js). Tests use createTestDb() from ./test-db instead.
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(url: string): Db {
  return drizzle(postgres(url, { max: 10 }), { schema });
}
