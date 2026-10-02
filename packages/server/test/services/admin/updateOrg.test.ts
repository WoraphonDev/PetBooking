import { randomUUID } from "node:crypto";
import { AdminUpdateOrgParams, AdminUpdateOrgRequest, AdminUpdateOrgResponse } from "@app/contracts/endpoints/admin.updateOrg";
import { auditLog, organization, platformAdmin } from "@app/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resolveCustomer, resolveStaff } from "../../../src/http/auth.ts";
import { withAdmin } from "../../../src/http/wrap.ts";
import { adminUpdateOrg } from "../../../src/services/admin/updateOrg.ts";
import { otherOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let adminId: string;
let token: string;
const PATCH = withAdmin("admin.updateOrg", { body: AdminUpdateOrgRequest, params: AdminUpdateOrgParams }, adminUpdateOrg);
const ctx = () => ({ ...makeSystemCtx(null, TEST_NOW), actor: { type: "admin" as const, id: adminId } });
const request = (status: unknown, orgId = env.base.orgId, cookie = token) =>
  PATCH(
    new Request("https://petbooking.test/api/v1/admin/organizations/x", {
      method: "PATCH",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `aid=${cookie}` },
      body: JSON.stringify(status),
    }),
    { params: { orgId } },
  );
beforeEach(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "unused" })
    .returning();
  if (!admin) throw new Error("Missing admin");
  adminId = admin.id;
  token = (await createSession(env.db, { subjectType: "platform_admin", subjectId: adminId }, TEST_NOW)).token;
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
it("updates another shop and writes one scoped audit with the same transaction time", async () => {
  const second = await otherOrg(env.db);
  const response = AdminUpdateOrgResponse.parse(await adminUpdateOrg(ctx(), { orgId: second.orgId, status: "suspended" }));
  expect(response).toMatchObject({ id: second.orgId, status: "suspended", ownerEmail: "owner@b.test" });
  const [audit] = await env.db.select().from(auditLog);
  expect(audit).toMatchObject({
    organizationId: second.orgId,
    actorType: "platform_admin",
    actorId: adminId,
    action: "organization.status_change",
    entityType: "organization",
    entityId: second.orgId,
    before: { status: "active" },
    after: { status: "suspended" },
    createdAt: TEST_NOW,
  });
  expect((await env.db.select().from(organization).where(eq(organization.id, second.orgId)))[0]?.updatedAt).toEqual(TEST_NOW);
  await adminUpdateOrg(ctx(), { orgId: second.orgId, status: "suspended" });
  expect(await env.db.select().from(auditLog)).toHaveLength(1);
  expect((await env.db.select().from(organization).where(eq(organization.id, env.base.orgId)))[0]?.status).toBe("active");
});
it("rolls back the status when audit insertion fails", async () => {
  await env.db.execute(sql`ALTER TABLE audit_log ADD CONSTRAINT test_reject_audit CHECK (action <> 'organization.status_change')`);
  await expect(adminUpdateOrg(ctx(), { orgId: env.base.orgId, status: "suspended" })).rejects.toThrow();
  expect((await env.db.select().from(organization).where(eq(organization.id, env.base.orgId)))[0]?.status).toBe("active");
  expect(await env.db.select().from(auditLog)).toEqual([]);
});
it("validates status and orgId, returns NOT_FOUND, and denies non-admin sessions", async () => {
  for (const [body, orgId] of [
    [{}, env.base.orgId],
    [{ status: "unknown" }, env.base.orgId],
    [{ status: "active" }, "invalid"],
  ] as const) {
    const response = await request(body, orgId);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  const missing = await request({ status: "active" }, randomUUID());
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  for (const [subjectType, subjectId] of [
    ["staff", env.base.staff.owner],
    ["customer", env.base.ownerProfileId],
  ] as const) {
    const session = await createSession(env.db, { subjectType, subjectId }, TEST_NOW);
    expect((await request({ status: "suspended" }, env.base.orgId, session.token)).status).toBe(401);
  }
});
it("suspension rejects existing staff/customer sessions while allowing admin reactivation", async () => {
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    TEST_NOW,
  );
  const customer = await createSession(
    env.db,
    { subjectType: "customer", subjectId: env.base.ownerProfileId, organizationId: env.base.orgId, branchId: env.base.branchId },
    TEST_NOW,
  );
  expect((await request({ status: "suspended" })).status).toBe(200);
  await expect(
    resolveStaff(new Request("https://petbooking.test", { headers: { cookie: `sid=${staff.token}` } }), TEST_NOW),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    resolveCustomer(new Request("https://petbooking.test", { headers: { cookie: `cid=${customer.token}` } }), TEST_NOW, "shop-a", false),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await request({ status: "active" })).status).toBe(200);
  expect(
    (await resolveStaff(new Request("https://petbooking.test", { headers: { cookie: `sid=${staff.token}` } }), TEST_NOW)).ctx.orgId,
  ).toBe(env.base.orgId);
  expect(
    (
      await resolveCustomer(
        new Request("https://petbooking.test", { headers: { cookie: `cid=${customer.token}` } }),
        TEST_NOW,
        "shop-a",
        false,
      )
    ).ctx.orgId,
  ).toBe(env.base.orgId);
});
