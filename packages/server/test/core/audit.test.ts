import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { auditLog, organization } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AUDIT_ACTIONS, writeAudit } from "../../src/audit.ts";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
});
afterEach(async () => env.close());
it("exports exactly the R-27 action catalog", () => {
  const spec = readFileSync(new URL("../../../../docs/spec/04-business-rules.md", import.meta.url), "utf8");
  const line = spec.split("\n").find((line) => line.startsWith("1. รายการ action (type AuditAction)"));
  expect(line).toBeDefined();
  expect([...AUDIT_ACTIONS].sort()).toEqual([...(line?.matchAll(/`([^`]+)`/g) ?? [])].map((m) => m[1]).sort());
});
it("writes only changed fields and context metadata, mapping support admin actors", async () => {
  const ctx = {
    ...staffCtx(env.base, "owner"),
    actor: { type: "admin" as const, id: randomUUID() },
    ip: "198.51.100.1",
    supportAccessLogId: randomUUID(),
  };
  await withTx(ctx, (tx) =>
    writeAudit(tx, ctx, {
      action: "organization.status_change",
      entityType: "organization",
      entityId: env.base.orgId,
      before: { status: "active", name: "same" },
      after: { status: "suspended", name: "same" },
    }),
  );
  expect(await env.db.select().from(auditLog)).toMatchObject([
    {
      organizationId: env.base.orgId,
      actorType: "platform_admin",
      actorId: ctx.actor.id,
      action: "organization.status_change",
      entityType: "organization",
      entityId: env.base.orgId,
      before: { status: "active" },
      after: { status: "suspended" },
      reason: null,
      ip: ctx.ip,
      supportAccessLogId: ctx.supportAccessLogId,
      createdAt: TEST_NOW,
    },
  ]);
});
it.each(AUDIT_ACTIONS.filter((action) => /void|cancel|waive|override|adjust|blacklist/.test(action)))(
  "requires a reason for %s",
  async (action) => {
    const ctx = staffCtx(env.base, "owner");
    for (const reason of [undefined, "", "  ", "ab"]) {
      await expect(
        withTx(ctx, (tx) => writeAudit(tx, ctx, { action, entityType: "booking", entityId: null, reason })),
      ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    }
    await withTx(ctx, (tx) => writeAudit(tx, ctx, { action, entityType: "booking", entityId: null, reason: "valid reason" }));
    expect(await env.db.select().from(auditLog)).toHaveLength(1);
  },
);
it("supports system-wide records without a tenant", async () => {
  const ctx = makeSystemCtx(null, TEST_NOW);
  await withTx(ctx, (tx) => writeAudit(tx, ctx, { action: "support.session_end", entityType: "support_access_log", entityId: null }));
  expect(await env.db.select().from(auditLog)).toMatchObject([
    { organizationId: null, actorType: "system", actorId: null, createdAt: TEST_NOW },
  ]);
});
it("rolls back both the state change and audit when the transaction fails", async () => {
  const ctx = staffCtx(env.base, "owner");
  await expect(
    withTx(ctx, async (tx) => {
      await tx.update(organization).set({ status: "suspended" }).where(eq(organization.id, env.base.orgId));
      await writeAudit(tx, ctx, { action: "organization.status_change", entityType: "organization", entityId: env.base.orgId });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await env.db.select().from(auditLog)).toHaveLength(0);
  expect(await env.db.select().from(organization)).toMatchObject([{ status: "active" }]);
});
