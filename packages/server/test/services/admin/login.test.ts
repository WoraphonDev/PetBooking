import { AdminLoginRequest, AdminLoginResponse } from "@app/contracts/endpoints/admin.login";
import { platformAdmin, session } from "@app/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as passwords from "../../../src/auth/password.ts";
import { hashPassword } from "../../../src/auth/password.ts";
import { hashToken, lookupSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { adminLogin } from "../../../src/services/admin/login.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const password = "PawsAndPuppies42!";
const POST = withPublic("admin.login", { body: AdminLoginRequest }, adminLogin);
const attempt = (body: unknown) =>
  POST(
    new Request("https://petbooking.test/api/v1/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
beforeEach(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  vi.stubEnv("NODE_ENV", "production");
  resetRateLimits();
  env = await setupTestDb();
  await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: await hashPassword(password) });
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
it("returns only the safe admin fields, resets failures and issues a 12-hour aid cookie", async () => {
  await env.db.update(platformAdmin).set({ failedLoginCount: 3, lockedUntil: new Date(0) });
  const response = await attempt({ email: " ADMIN@Example.Test ", password });
  const [admin] = await env.db.select().from(platformAdmin);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(AdminLoginResponse.safeParse(body).success).toBe(true);
  expect(body).toEqual({
    admin: { id: admin?.id, email: "admin@example.test", displayName: "Admin" },
  });
  expect(response.headers.get("set-cookie")).toMatch(/^aid=[^;]+;.*HttpOnly;.*SameSite=Lax;.*Secure/);
  const cookieToken = response.headers.get("set-cookie")?.split(";")[0]?.slice(4);
  if (!cookieToken) throw new Error("Missing aid token");
  const [stored] = await env.db
    .select()
    .from(session)
    .where(eq(session.tokenHash, hashToken(decodeURIComponent(cookieToken))));
  expect(stored).toMatchObject({ subjectType: "platform_admin", subjectId: admin?.id, organizationId: null });
  expect((stored?.expiresAt.getTime() ?? 0) - (stored?.lastSeenAt.getTime() ?? 0)).toBe(12 * 60 * 60_000);
  expect(admin).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  if (!stored) throw new Error("Missing session");
  expect(await lookupSession(env.db, decodeURIComponent(cookieToken), stored.expiresAt)).toBeNull();
});
it("persists every failed attempt, locks on the fifth and clears an expired lock on success", async () => {
  const ctx = makeSystemCtx(null, TEST_NOW);
  const http = { session: null, setCookie: vi.fn() };
  for (let i = 1; i <= 5; i++) {
    await expect(adminLogin(ctx, { email: "admin@example.test", password: "wrong" }, http)).rejects.toMatchObject({
      code: i === 5 ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
    });
    const [row] = await env.db.select().from(platformAdmin);
    expect(row?.failedLoginCount).toBe(i === 5 ? 0 : i);
    expect(row?.lockedUntil).toEqual(i === 5 ? new Date(TEST_NOW.getTime() + 15 * 60_000) : null);
  }
  const verifier = vi.spyOn(passwords, "verifyPassword");
  await expect(adminLogin(ctx, { email: "admin@example.test", password }, http)).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
  expect(verifier).not.toHaveBeenCalled();
  verifier.mockRestore();
  expect(http.setCookie).not.toHaveBeenCalled();
  await adminLogin({ ...ctx, now: new Date(TEST_NOW.getTime() + 15 * 60_000) }, { email: "admin@example.test", password }, http);
  expect((await env.db.select().from(platformAdmin))[0]).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
});
it("rejects unknown, wrong-password and disabled accounts uniformly", async () => {
  for (const email of ["missing@example.test", "admin@example.test"]) {
    const response = await attempt({ email, password: "wrong" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  }
  await env.db.update(platformAdmin).set({ status: "disabled" }).where(eq(platformAdmin.email, "admin@example.test"));
  const disabled = await attempt({ email: "admin@example.test", password });
  expect(disabled.status).toBe(401);
  expect(await disabled.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  expect(await env.db.select().from(session)).toEqual([]);
});
it("validates required fields and reports active lockout as 423", async () => {
  for (const body of [
    {},
    { password },
    { email: "admin@example.test" },
    { email: "bad", password },
    { email: "admin@example.test", password: 1 },
    { email: "admin@example.test", password: "x".repeat(129) },
  ]) {
    const response = await attempt(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  await env.db.update(platformAdmin).set({ lockedUntil: new Date("2099-01-01") });
  expect((await attempt({ email: "admin@example.test", password })).status).toBe(423);
});

it("rolls back successful-login resets if session persistence fails", async () => {
  await env.db.update(platformAdmin).set({ failedLoginCount: 3 });
  await env.db.execute(sql`ALTER TABLE session ADD CONSTRAINT test_reject_admin_session CHECK (subject_type <> 'platform_admin')`);
  const http = { session: null, setCookie: vi.fn() };
  await expect(adminLogin(makeSystemCtx(null, TEST_NOW), { email: "admin@example.test", password }, http)).rejects.toThrow();
  expect((await env.db.select().from(platformAdmin))[0]?.failedLoginCount).toBe(3);
  expect(await env.db.select().from(session)).toEqual([]);
  expect(http.setCookie).not.toHaveBeenCalled();
});
