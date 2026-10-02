import { randomUUID } from "node:crypto";
import { AuthMeRequest, AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { branch, organization, platformAdmin, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PERMISSIONS } from "../../../src/auth/permissions.ts";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { authMe } from "../../../src/services/auth/me.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("auth.me", { query: AuthMeRequest }, authMe);
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
});
afterEach(async () => {
  await env.close();
});
async function request(token?: string) {
  return GET(new Request("https://petbooking.test/api/v1/auth/staff/me", { headers: token ? { cookie: `sid=${token}` } : {} }));
}
async function staffSession(role: "owner" | "front_desk" | "staff") {
  return createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
}
function permissions(role: "owner" | "front_desk" | "staff") {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => (roles as readonly string[]).includes(role))
    .map(([key]) => key);
}

it.each(["owner", "front_desk", "staff"] as const)("returns every StaffMe field and exact permissions for %s", async (role) => {
  const current = await staffSession(role);
  const response = await request(current.token);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(AuthMeResponse.safeParse(body).success).toBe(true);
  expect(body).toEqual({
    staff: { id: env.base.staff[role], displayName: role, email: `${role}@a.test`, role, isGroomer: false, lineLinked: false },
    organization: { id: env.base.orgId, name: "Shop a", status: "active" },
    branch: {
      id: env.base.branchId,
      name: "Shop a",
      bookingSlug: "shop-a",
      timezone: "Asia/Bangkok",
      modules: { grooming: true, hotel: false, daycare: false },
    },
    permissions: permissions(role),
    supportMode: false,
  });
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("preserves null email for LINE-only staff and maps groomer/LINE flags", async () => {
  await env.db
    .update(staffUser)
    .set({ email: null, lineUserId: "line-only-staff", isGroomer: true })
    .where(eq(staffUser.id, env.base.staff.staff));
  const current = await staffSession("staff");
  const response = await request(current.token);
  expect(response.status).toBe(200);
  const body = AuthMeResponse.parse(await response.json());
  expect(body.staff).toEqual({
    id: env.base.staff.staff,
    displayName: "staff",
    email: null,
    role: "staff",
    isGroomer: true,
    lineLinked: true,
  });
});
it("uses admin identity and the session's organization/branch for support mode", async () => {
  const foreign = await otherOrg(env.db);
  await env.db.update(organization).set({ status: "suspended" }).where(eq(organization.id, foreign.orgId));
  await env.db
    .update(branch)
    .set({ name: "Support branch", moduleHotel: true, moduleDaycare: true })
    .where(eq(branch.id, foreign.branchId));
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Support agent", passwordHash: "test-only" })
    .returning();
  if (!admin) throw new Error("Expected admin fixture");
  const current = await createSession(
    env.db,
    {
      subjectType: "platform_admin",
      subjectId: admin.id,
      organizationId: foreign.orgId,
      branchId: foreign.branchId,
      supportAccessLogId: randomUUID(),
    },
    new Date(),
  );
  const response = await request(current.token);
  expect(response.status).toBe(200);
  const body = AuthMeResponse.parse(await response.json());
  expect(body).toEqual({
    staff: { id: admin.id, displayName: "Support agent", email: "admin@example.test", role: "owner", isGroomer: false, lineLinked: false },
    organization: { id: foreign.orgId, name: "Shop b", status: "suspended" },
    branch: {
      id: foreign.branchId,
      name: "Support branch",
      bookingSlug: "shop-b",
      timezone: "Asia/Bangkok",
      modules: { grooming: true, hotel: true, daycare: true },
    },
    permissions: permissions("owner"),
    supportMode: true,
  });
});
it("returns NOT_FOUND for foreign staff or branch within a tenant context", async () => {
  const foreign = await otherOrg(env.db);
  const ctx = staffCtx(env.base, "owner");
  await expect(authMe({ ...ctx, actor: { ...ctx.actor, id: foreign.staff.owner } }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(authMe({ ...ctx, branchId: foreign.branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("denies customer actors, missing sessions and admin sessions without support access", async () => {
  await expect(authMe(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await request()).status).toBe(401);
  const current = await createSession(
    env.db,
    { subjectType: "platform_admin", subjectId: randomUUID(), organizationId: env.base.orgId },
    new Date(),
  );
  const response = await request(current.token);
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
});
it("denies ordinary staff access to a suspended organization", async () => {
  const current = await staffSession("owner");
  await env.db.update(organization).set({ status: "suspended" }).where(eq(organization.id, env.base.orgId));
  const response = await request(current.token);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});
