import { readFileSync } from "node:fs";
import { AuthInviteAcceptRequest, AuthInviteAcceptResponse } from "@app/contracts/endpoints/auth.inviteAccept";
import { consentRecord, session, staffInvite, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifyPassword } from "../../../src/auth/password.ts";
import { hashToken } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { authInviteAccept } from "../../../src/services/auth/inviteAccept.ts";
import { setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const reference = JSON.parse(readFileSync(new URL("../../../../../docs/spec/vectors/reference-data.json", import.meta.url), "utf8"));
const POST = withPublic("auth.inviteAccept", { body: AuthInviteAcceptRequest }, authInviteAccept);
const DAY = 24 * 60 * 60_000;
let env: TestEnv;

beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

async function seedInvite(
  opts: {
    role?: "owner" | "front_desk" | "staff";
    email?: string | null;
    status?: "invited" | "active" | "disabled";
    token?: string;
    expiresInMs?: number;
  } = {},
) {
  const [staff] = await env.db
    .insert(staffUser)
    .values({
      organizationId: env.base.orgId,
      email: opts.email === undefined ? "new@a.test" : opts.email,
      displayName: "invited",
      role: opts.role ?? "staff",
      status: opts.status ?? "invited",
    })
    .returning();
  if (!staff) throw new Error("seed staff");
  const [invite] = await env.db
    .insert(staffInvite)
    .values({
      organizationId: env.base.orgId,
      staffUserId: staff.id,
      tokenHash: hashToken(opts.token ?? "invite-token"),
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 7 * DAY)),
      createdBy: env.base.staff.owner,
    })
    .returning();
  if (!invite) throw new Error("seed invite");
  return { staff, invite };
}

function request(body: unknown) {
  return POST(
    new Request("https://petbooking.test/api/v1/auth/staff/invite/accept", {
      method: "POST",
      headers: { origin: "https://petbooking.test", "x-forwarded-for": "203.0.113.7", "user-agent": "vitest-agent" },
      body: JSON.stringify(body),
    }),
  );
}
const errorCode = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const staffRow = async (id: string) => (await env.db.select().from(staffUser).where(eq(staffUser.id, id)))[0];
const inviteRow = async (id: string) => (await env.db.select().from(staffInvite).where(eq(staffInvite.id, id)))[0];

it("activates an owner invite: maps every field, accepts the invite, starts a session and records shop consent", async () => {
  const { staff, invite } = await seedInvite({ role: "owner", email: "boss@a.test" });
  const response = await request({ token: "invite-token", displayName: " คุณบอส ", email: "ignored@a.test", password: "groom2026!" });
  expect(response.status).toBe(200);
  const body = AuthInviteAcceptResponse.parse(await response.json());
  expect(body.staff).toEqual({
    id: staff.id,
    displayName: "คุณบอส",
    email: "boss@a.test",
    role: "owner",
    isGroomer: false,
    lineLinked: false,
  });
  expect(body).toMatchObject({ organization: { id: env.base.orgId }, branch: { id: env.base.branchId }, supportMode: false });
  expect(body.permissions.length).toBeGreaterThan(0);

  const row = await staffRow(staff.id);
  expect(row).toMatchObject({ status: "active", displayName: "คุณบอส", email: "boss@a.test" });
  expect(await verifyPassword(row?.passwordHash ?? "", "groom2026!")).toBe(true);
  const accepted = await inviteRow(invite.id);
  expect(accepted?.acceptedAt).toBeInstanceOf(Date);

  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toMatch(/^sid=[^;]+; Path=\/; Expires=.*; HttpOnly; SameSite=Lax/);
  const sessions = await env.db.select().from(session).where(eq(session.subjectId, staff.id));
  expect(sessions).toEqual([
    expect.objectContaining({ subjectType: "staff", organizationId: env.base.orgId, branchId: env.base.branchId }),
  ]);
  expect(sessions[0]?.tokenHash).toBe(hashToken(decodeURIComponent(cookie.split(";")[0]?.slice(4) ?? "")));

  const consents = await env.db.select().from(consentRecord);
  expect(consents.map((c) => c.document).sort()).toEqual(["dpa", "terms_of_service"]);
  for (const c of consents) {
    expect(c).toMatchObject({
      subjectType: "organization",
      subjectId: env.base.orgId,
      organizationId: env.base.orgId,
      version: reference.legalDocs[c.document].version,
      accepted: true,
      ip: "203.0.113.7",
      userAgent: "vitest-agent",
      createdAt: accepted?.acceptedAt,
    });
  }
});

it("takes the email from the request when the invite has none and allows LINE-only (no password); no consent for non-owners", async () => {
  const { staff } = await seedInvite({ email: null });
  const response = await request({ token: "invite-token", displayName: "ช่างเอ", email: " NEW.Groomer@A.test " });
  expect(response.status).toBe(200);
  expect(await staffRow(staff.id)).toMatchObject({ status: "active", email: "new.groomer@a.test", passwordHash: null });
  expect(await env.db.select().from(consentRecord)).toEqual([]);
});

it.each([
  ["unknown token", {}, "other-token"],
  ["expired invite", { expiresInMs: -1 }, "invite-token"],
])("rejects %s with TOKEN_INVALID", async (_, opts, token) => {
  await seedInvite(opts);
  const response = await request({ token, displayName: "x", password: "groom2026!" });
  expect(response.status).toBe(400);
  expect(await errorCode(response)).toBe("TOKEN_INVALID");
});

it("rejects an already accepted invite with TOKEN_INVALID", async () => {
  await seedInvite();
  expect((await request({ token: "invite-token", displayName: "x" })).status).toBe(200);
  expect(await errorCode(await request({ token: "invite-token", displayName: "y" }))).toBe("TOKEN_INVALID");
});

it("rejects a password that breaks R-24 with PASSWORD_POLICY and changes nothing", async () => {
  const { staff, invite } = await seedInvite();
  const response = await request({ token: "invite-token", displayName: "x", password: "12345678" });
  expect(response.status).toBe(422);
  expect(await errorCode(response)).toBe("PASSWORD_POLICY");
  expect(await staffRow(staff.id)).toMatchObject({ status: "invited", passwordHash: null });
  expect((await inviteRow(invite.id))?.acceptedAt).toBeNull();
});

it("rejects an email already used by any staff with EMAIL_TAKEN and rolls back", async () => {
  const { staff, invite } = await seedInvite({ email: null });
  const response = await request({ token: "invite-token", displayName: "x", email: "OWNER@a.test" });
  expect(response.status).toBe(409);
  expect(await errorCode(response)).toBe("EMAIL_TAKEN");
  expect(await staffRow(staff.id)).toMatchObject({ status: "invited", email: null });
  expect((await inviteRow(invite.id))?.acceptedAt).toBeNull();
  expect(await env.db.select().from(session).where(eq(session.subjectId, staff.id))).toEqual([]);
});

it("rejects missing or malformed fields with VALIDATION_FAILED", async () => {
  await seedInvite({ email: null });
  for (const body of [
    { displayName: "x", email: "a@b.test" },
    { token: "invite-token", email: "a@b.test" },
    { token: "invite-token", displayName: "x".repeat(41), email: "a@b.test" },
    { token: "invite-token", displayName: "  ", email: "a@b.test" },
    { token: "invite-token", displayName: "x", email: "not-an-email" },
    // the invite has no email, so the request must carry one
    { token: "invite-token", displayName: "x" },
  ]) {
    const response = await request(body);
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("VALIDATION_FAILED");
  }
});

it.each(["active", "disabled"] as const)("rejects a %s staff user with INVALID_TRANSITION (only invited → active)", async (status) => {
  const { staff, invite } = await seedInvite({ status });
  const response = await request({ token: "invite-token", displayName: "x" });
  expect(response.status).toBe(409);
  expect(await errorCode(response)).toBe("INVALID_TRANSITION");
  expect((await staffRow(staff.id))?.status).toBe(status);
  expect((await inviteRow(invite.id))?.acceptedAt).toBeNull();
});
