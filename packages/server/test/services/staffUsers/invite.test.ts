import { StaffUsersInviteRequest, StaffUsersInviteResponse } from "@app/contracts/endpoints/staffUsers.invite";
import { auditLog, notification, staffInvite, staffUser } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staffUsersInvite } from "../../../src/services/staffUsers/invite.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("staffUsers.invite", { body: StaffUsersInviteRequest }, staffUsersInvite);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function call(
  method: string,
  url: string,
  params: Record<string, string>,
  body: unknown,
  role: "owner" | "front_desk" | "staff" = "owner",
  org: SeedOrg = env.base,
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const invite = (body: unknown, role: "owner" | "front_desk" | "staff" = "owner", org: SeedOrg = env.base) =>
  call("POST", "/api/v1/staff/staff-users/invite", {}, body, role, org);

it("creates an invited staff user + 7-day invite, audits it, emails the invite and returns the link", async () => {
  const res = await invite({ displayName: "ช่างแพร", email: "Prae@Shop.test", role: "staff", isGroomer: true });
  expect(res.status).toBe(200);
  const body = StaffUsersInviteResponse.parse(await res.json());
  expect(body.staffUser).toMatchObject({
    displayName: "ช่างแพร",
    email: "prae@shop.test",
    role: "staff",
    isGroomer: true,
    status: "invited",
  });
  expect(body.inviteUrl).toMatch(/^https:\/\/petbooking\.test\/invite\/[\w-]{20,}$/);
  const [inv] = await env.db.select().from(staffInvite).where(eq(staffInvite.staffUserId, body.staffUser.id));
  expect(inv?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  expect(inv?.tokenHash).not.toContain(body.inviteUrl.split("/").pop());
  const [audit] = await env.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, "staff.invite"), eq(auditLog.entityId, inv?.id ?? "")));
  expect(audit).toBeDefined();
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `invite:${inv?.id}:${body.staffUser.id}`));
  expect(note).toMatchObject({
    templateKey: "staff.invite",
    recipientType: "staff",
    payload: { inviteUrl: body.inviteUrl, shopName: expect.any(String) },
  });
});

it("without an email: only the link (no message)", async () => {
  const body = StaffUsersInviteResponse.parse(await (await invite({ displayName: "ช่างบี", role: "front_desk", isGroomer: false })).json());
  expect(body.staffUser.email).toBeNull();
  const [inv] = await env.db.select().from(staffInvite).where(eq(staffInvite.staffUserId, body.staffUser.id));
  expect(
    await env.db
      .select()
      .from(notification)
      .where(eq(notification.dedupeKey, `invite:${inv?.id}:${body.staffUser.id}`)),
  ).toEqual([]);
});

it("an email already used (any organization) → EMAIL_TAKEN, nothing created", async () => {
  const [taken] = await env.db.select().from(staffUser).where(eq(staffUser.id, other.staff.owner));
  const before = (await env.db.select().from(staffUser)).length;
  expect(await codeOf(await invite({ displayName: "ซ้ำ", email: taken?.email?.toUpperCase(), role: "staff", isGroomer: false }))).toBe(
    "EMAIL_TAKEN",
  );
  expect(await env.db.select().from(staffUser)).toHaveLength(before);
});

it.each([
  ["missing displayName", { role: "staff", isGroomer: false }],
  ["displayName over 40", { displayName: "ก".repeat(41), role: "staff", isGroomer: false }],
  ["bad email", { displayName: "x", email: "nope", role: "staff", isGroomer: false }],
  ["unknown role", { displayName: "x", role: "boss", isGroomer: false }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await invite(body))).toBe("VALIDATION_FAILED");
});

it("front_desk / staff → FORBIDDEN; the invite lands in the caller's organization", async () => {
  for (const role of ["front_desk", "staff"] as const)
    expect(await codeOf(await invite({ displayName: "x", role: "staff", isGroomer: false }, role))).toBe("FORBIDDEN");
  const body = StaffUsersInviteResponse.parse(
    await (await invite({ displayName: "ร้านอื่น", role: "staff", isGroomer: false }, "owner", other)).json(),
  );
  expect((await env.db.select().from(staffUser).where(eq(staffUser.id, body.staffUser.id)))[0]?.organizationId).toBe(other.orgId);
});
