import { AuthResetConfirmRequest, AuthResetConfirmResponse } from "@app/contracts/endpoints/auth.resetConfirm";
import { passwordReset, session, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifyPassword } from "../../../src/auth/password.ts";
import * as sessions from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { authResetConfirm } from "../../../src/services/auth/resetConfirm.ts";
import { otherOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withPublic("auth.resetConfirm", { body: AuthResetConfirmRequest }, authResetConfirm);
const token = "reset-token";
const newPassword = "New password 123";
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await env.close();
});
async function seedReset(staffUserId = env.base.staff.owner, overrides: Partial<typeof passwordReset.$inferInsert> = {}) {
  await env.db.insert(passwordReset).values({
    staffUserId,
    tokenHash: sessions.hashToken(token),
    createdAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + 30 * 60_000),
    ...overrides,
  });
}
function confirm() {
  return authResetConfirm(makeSystemCtx(null, TEST_NOW), { token, newPassword });
}
function request(body: unknown) {
  return POST(
    new Request("https://petbooking.test/api/v1/auth/staff/password-reset/confirm", {
      method: "POST",
      headers: { origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
}

it("hashes the new password, consumes the token and revokes only the target staff's sessions", async () => {
  const foreign = await otherOrg(env.db);
  await seedReset(foreign.staff.owner);
  for (let i = 0; i < 2; i++)
    await sessions.createSession(
      env.db,
      {
        subjectType: "staff",
        subjectId: foreign.staff.owner,
        organizationId: foreign.orgId,
      },
      TEST_NOW,
    );
  const retained = await sessions.createSession(
    env.db,
    {
      subjectType: "staff",
      subjectId: env.base.staff.owner,
      organizationId: env.base.orgId,
    },
    TEST_NOW,
  );
  const customer = await sessions.createSession(
    env.db,
    {
      subjectType: "customer",
      subjectId: foreign.staff.owner,
      organizationId: foreign.orgId,
    },
    TEST_NOW,
  );
  const [untouched] = await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.owner));
  expect(AuthResetConfirmResponse.parse(await confirm())).toBeUndefined();
  const [staff] = await env.db.select().from(staffUser).where(eq(staffUser.id, foreign.staff.owner));
  expect(staff?.passwordHash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(staff?.passwordHash ?? "", newPassword)).toBe(true);
  expect(staff?.updatedAt).toEqual(TEST_NOW);
  expect(await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.owner))).toEqual([untouched]);
  expect(await env.db.select().from(passwordReset)).toMatchObject([{ usedAt: TEST_NOW }]);
  expect((await env.db.select().from(session)).map((s) => s.id).sort()).toEqual([retained.session.id, customer.session.id].sort());
  await expect(confirm()).rejects.toMatchObject({ code: "TOKEN_INVALID" });
});
it.each(["unknown", "expired", "expiry boundary", "used"])("rejects a %s token without changing state", async (kind) => {
  if (kind !== "unknown")
    await seedReset(env.base.staff.owner, {
      ...(kind === "expired" ? { expiresAt: new Date(TEST_NOW.getTime() - 1) } : {}),
      ...(kind === "expiry boundary" ? { expiresAt: TEST_NOW } : {}),
      ...(kind === "used" ? { usedAt: new Date(TEST_NOW.getTime() - 1) } : {}),
    });
  await sessions.createSession(env.db, { subjectType: "staff", subjectId: env.base.staff.owner }, TEST_NOW);
  const before = await env.db.select().from(staffUser);
  const resets = await env.db.select().from(passwordReset);
  await expect(confirm()).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  expect(await env.db.select().from(staffUser)).toEqual(before);
  expect(await env.db.select().from(passwordReset)).toEqual(resets);
  expect(await env.db.select().from(session)).toHaveLength(1);
});
it.each([
  ["short", "PASSWORD_TOO_SHORT"],
  ["12345678", "PASSWORD_ALL_DIGITS"],
  ["x".repeat(129), "PASSWORD_TOO_LONG"],
  ["resetowner", "PASSWORD_SAME_AS_EMAIL"],
])("rejects a password violating %s without consuming the token", async (password, reason) => {
  await env.db.update(staffUser).set({ email: "resetowner@example.test" }).where(eq(staffUser.id, env.base.staff.owner));
  await seedReset();
  const before = await env.db.select().from(staffUser);
  await expect(authResetConfirm(makeSystemCtx(null, TEST_NOW), { token, newPassword: password })).rejects.toMatchObject({
    code: "PASSWORD_POLICY",
    details: { reason },
  });
  expect(await env.db.select().from(staffUser)).toEqual(before);
  expect(await env.db.select().from(passwordReset)).toMatchObject([{ usedAt: null }]);
});
it("returns HTTP 204 without a session cookie for a valid public request", async () => {
  await seedReset();
  const response = await request({ token, newPassword });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("maps endpoint errors and invalid input to the specified HTTP errors", async () => {
  const invalid = await request({ token, newPassword });
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: { code: "TOKEN_INVALID" } });
  await seedReset();
  const policy = await request({ token, newPassword: "short" });
  expect(policy.status).toBe(422);
  expect(await policy.json()).toMatchObject({ error: { code: "PASSWORD_POLICY", details: { reason: "PASSWORD_TOO_SHORT" } } });
  for (const body of [{}, { token }, { newPassword }, { token: null, newPassword }, { token, newPassword: 123 }]) {
    const response = await request(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
it("rolls back password and token changes if session revocation fails", async () => {
  await seedReset();
  await sessions.createSession(env.db, { subjectType: "staff", subjectId: env.base.staff.owner }, TEST_NOW);
  const before = await env.db.select().from(staffUser);
  vi.spyOn(sessions, "revokeAllFor").mockRejectedValueOnce(new Error("revocation unavailable"));
  await expect(confirm()).rejects.toThrow("revocation unavailable");
  expect(await env.db.select().from(staffUser)).toEqual(before);
  expect(await env.db.select().from(passwordReset)).toMatchObject([{ usedAt: null }]);
  expect(await env.db.select().from(session)).toHaveLength(1);
});
