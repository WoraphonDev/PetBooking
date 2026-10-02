import { randomUUID } from "node:crypto";
import { StaffUsersResendInviteRequest, StaffUsersResendInviteResponse } from "@app/contracts/endpoints/staffUsers.resendInvite";
import { auditLog, staffInvite, staffUser } from "@app/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession, hashToken } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { authInviteAccept } from "../../../src/services/auth/inviteAccept.ts";
import { staffUsersResendInvite } from "../../../src/services/staffUsers/resendInvite.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const targetId = randomUUID();
const BASE = "https://petbooking.test";
const POST = withStaff("staffUsers.resendInvite", { params: StaffUsersResendInviteRequest }, staffUsersResendInvite);
beforeEach(async () => {
  resetRateLimits();
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", BASE);
  await env.db.insert(staffUser).values({
    id: targetId,
    organizationId: env.base.orgId,
    email: "invited@a.test",
    displayName: "Invited staff",
    role: "staff",
    status: "invited",
  });
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
async function post(
  params: Record<string, string | undefined> = { staffUserId: targetId },
  role: "owner" | "front_desk" | "staff" = "owner",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`${BASE}/api/v1/staff/staff-users/${params.staffUserId}/resend-invite`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: BASE },
    }),
    { params: Promise.resolve(params) },
  );
}

it("returns an opaque invite URL and stores only its hash with seven-day expiry, creator and ctx.now", async () => {
  const ctx = staffCtx(env.base, "owner");
  const response = StaffUsersResendInviteResponse.parse(await staffUsersResendInvite(ctx, { staffUserId: targetId }));
  const url = new URL(response.inviteUrl);
  expect(url.origin).toBe(BASE);
  expect(url.pathname).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
  const token = url.pathname.split("/")[2] ?? "";
  const invites = await env.db.select().from(staffInvite);
  expect(invites).toHaveLength(1);
  expect(invites[0]).toMatchObject({
    organizationId: env.base.orgId,
    staffUserId: targetId,
    tokenHash: hashToken(token),
    expiresAt: new Date(TEST_NOW.getTime() + 7 * 24 * 60 * 60_000),
    acceptedAt: null,
    createdBy: env.base.staff.owner,
    createdAt: TEST_NOW,
  });
  const logs = await env.db.select().from(auditLog);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    organizationId: env.base.orgId,
    actorType: "staff",
    actorId: env.base.staff.owner,
    action: "staff.invite",
    entityType: "staff_invite",
    entityId: invites[0]?.id,
    before: null,
    after: { staffUserId: targetId, expiresAt: invites[0]?.expiresAt.toISOString() },
    createdAt: TEST_NOW,
  });
  expect(JSON.stringify(logs)).not.toContain(token);
  expect(JSON.stringify(logs)).not.toContain(hashToken(token));
});
it("returns the specified response through the HTTP wrapper", async () => {
  const response = await post();
  expect(response.status).toBe(200);
  expect(StaffUsersResendInviteResponse.parse(await response.json()).inviteUrl).toMatch(/^https:\/\/petbooking.test\/invite\//);
});
it("creates a distinct invite without changing the old row, whose token still accepts the invitation", async () => {
  const ctx = staffCtx(env.base, "owner");
  const first = await staffUsersResendInvite(ctx, { staffUserId: targetId });
  const before = await env.db.select().from(staffInvite);
  const second = await staffUsersResendInvite(ctx, { staffUserId: targetId });
  expect(second.inviteUrl).not.toBe(first.inviteUrl);
  expect(await env.db.select().from(staffInvite)).toHaveLength(2);
  expect(
    await env.db
      .select()
      .from(staffInvite)
      .where(eq(staffInvite.id, before[0]?.id ?? "")),
  ).toEqual(before);
  const accepted = await authInviteAccept(
    makeSystemCtx(null, TEST_NOW),
    { token: new URL(first.inviteUrl).pathname.split("/")[2] ?? "", displayName: "Accepted staff", password: "groom2026!" },
    { session: null, setCookie: vi.fn() },
  );
  expect(accepted.staff.id).toBe(targetId);
  expect(
    (
      await env.db
        .select()
        .from(staffInvite)
        .where(eq(staffInvite.id, before[0]?.id ?? ""))
    )[0]?.acceptedAt,
  ).toEqual(TEST_NOW);
});
it("rejects absent and malformed path IDs before writing", async () => {
  for (const params of [{}, { staffUserId: "invalid" }]) {
    const response = await post(params);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(staffInvite)).toHaveLength(0);
  expect(await env.db.select().from(auditLog)).toHaveLength(0);
});
it.each(["front_desk", "staff"] as const)("denies %s without writes", async (role) => {
  const response = await post({ staffUserId: targetId }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(staffUsersResendInvite(staffCtx(env.base, role), { staffUserId: targetId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(staffInvite)).toHaveLength(0);
  expect(await env.db.select().from(auditLog)).toHaveLength(0);
});
it("denies absent sessions and customer actors", async () => {
  const response = await POST(new Request(`${BASE}/api/v1/staff/staff-users/${targetId}/resend-invite`, { method: "POST" }));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  await expect(staffUsersResendInvite(customerCtx(env.base), { staffUserId: targetId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(staffInvite)).toHaveLength(0);
});
it("returns NOT_FOUND for missing staff and other-organization staff without writes", async () => {
  const foreign = await otherOrg(env.db);
  for (const staffUserId of [randomUUID(), foreign.staff.staff]) {
    const response = await post({ staffUserId });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  }
  expect(await env.db.select().from(staffInvite)).toHaveLength(0);
  expect(await env.db.select().from(auditLog)).toHaveLength(0);
});
it("rolls back the invite if its audit insert fails", async () => {
  await env.db.execute(sql`ALTER TABLE audit_log ADD CONSTRAINT test_reject_staff_invite CHECK (action <> 'staff.invite')`);
  try {
    await expect(staffUsersResendInvite(staffCtx(env.base, "owner"), { staffUserId: targetId })).rejects.toMatchObject({
      code: "INTERNAL",
    });
    expect(await env.db.select().from(staffInvite)).toHaveLength(0);
    expect(await env.db.select().from(auditLog)).toHaveLength(0);
  } finally {
    await env.db.execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_reject_staff_invite`);
  }
});
