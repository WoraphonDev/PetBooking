// setupTestDb(): PGlite with all migrations + seedBase, installed as the server db (getDb/withTx use it).
import { randomUUID } from "node:crypto";
import type { StaffRole } from "@app/contracts/enums";
import { createTestDb, type TestDb } from "@app/db/test-db";
import type { RequestContext } from "../../src/context.ts";
import { type AppDb, setDb } from "../../src/db.ts";
import { type SeedOrg, seedBase } from "./seed.ts";

export { otherOrg, type SeedOrg, seedBase, seedOrg } from "./seed.ts";

export const TEST_NOW = new Date("2026-10-05T03:00:00.000Z");

export type TestEnv = { t: TestDb; db: AppDb; base: SeedOrg; close: () => Promise<void> };

export async function setupTestDb(): Promise<TestEnv> {
  const t = await createTestDb();
  const db = t.db as unknown as AppDb;
  const base = await seedBase(db);
  setDb(db);
  return {
    t,
    db,
    base,
    close: async () => {
      setDb(null);
      await t.close();
    },
  };
}

const ctxFor = (base: SeedOrg, actor: RequestContext["actor"]): RequestContext => ({
  now: TEST_NOW,
  requestId: randomUUID(),
  actor,
  orgId: base.orgId,
  branchId: base.branchId,
  timezone: "Asia/Bangkok",
  supportAccessLogId: null,
  ip: null,
  userAgent: null,
});

export const staffCtx = (base: SeedOrg, role: StaffRole): RequestContext => ctxFor(base, { type: "staff", id: base.staff[role], role });
export const customerCtx = (base: SeedOrg): RequestContext => ctxFor(base, { type: "customer", id: base.customerId });
