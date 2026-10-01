import { customer, ownerProfile, vaccineType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { getDb, withTx } from "../../src/db.ts";
import { tenantDb } from "../../src/repo/tenant.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => env.close());

describe("tenantDb", () => {
  it("select never returns another org's rows", async () => {
    const rows = await tenantDb(staffCtx(env.base, "owner"), env.db).select(customer);
    expect(rows.map((r) => r.id)).toEqual([env.base.customerId]);
    const byId = await tenantDb(staffCtx(env.base, "owner"), env.db).select(customer, eq(customer.id, other.customerId));
    expect(byId).toEqual([]);
  });

  it("update cannot touch another org's row and cannot move a row to another org", async () => {
    const db = tenantDb(staffCtx(env.base, "owner"), env.db);
    expect(await db.update(customer, { internalNote: "x" }, eq(customer.id, other.customerId))).toEqual([]);
    const [mine] = await db.update(
      customer,
      { internalNote: "ok", organizationId: other.orgId } as never,
      eq(customer.id, env.base.customerId),
    );
    expect(mine?.organizationId).toBe(env.base.orgId);
    const [theirs] = await env.db.select().from(customer).where(eq(customer.id, other.customerId));
    expect(theirs?.internalNote).toBeNull();
  });

  it("insert always uses ctx.orgId", async () => {
    const [op] = await env.db.insert(ownerProfile).values({ createdInOrgId: env.base.orgId, firstName: "X" }).returning();
    const [row] = await tenantDb(staffCtx(env.base, "front_desk"), env.db).insert(customer, {
      ownerProfileId: op?.id ?? "",
      organizationId: other.orgId,
    } as never);
    expect(row?.organizationId).toBe(env.base.orgId);
  });

  it("rejects a ctx without orgId and tables without organization_id", () => {
    expect(() => tenantDb(makeSystemCtx(null, new Date(0)), env.db)).toThrow(/orgId/);
    expect(() => tenantDb(staffCtx(env.base, "owner"), env.db).select(vaccineType as never)).toThrow(/organization_id/);
  });
});

describe("withTx", () => {
  it("commits on success and rolls back on throw", async () => {
    const ctx = staffCtx(env.base, "owner");
    await withTx(ctx, (tx) => tenantDb(ctx, tx).update(customer, { internalNote: "committed" }, eq(customer.id, env.base.customerId)));
    await expect(
      withTx(ctx, async (tx) => {
        await tenantDb(ctx, tx).update(customer, { internalNote: "rolled back" }, eq(customer.id, env.base.customerId));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const [row] = await getDb().select().from(customer).where(eq(customer.id, env.base.customerId));
    expect(row?.internalNote).toBe("committed");
  });
});
