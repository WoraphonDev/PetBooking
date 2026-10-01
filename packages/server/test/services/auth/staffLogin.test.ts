import { AuthStaffLoginRequest, AuthStaffLoginResponse } from "@app/contracts/endpoints/auth.staffLogin";
import { session, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPublic } from "../../../src/http/wrap.ts";
import { authStaffLogin } from "../../../src/services/auth/staffLogin.ts";

const POST = withPublic("auth.staffLogin", { body: AuthStaffLoginRequest }, authStaffLogin);

import { hashPassword } from "../../../src/auth/password.ts";
import { hashToken, lookupSession, SESSION_TTL_MS } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const password = "PawsAndPuppies42!";
let ipSuffix = 0;

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

async function request(body: unknown, ip = `198.51.100.${++ipSuffix}`) {
  return POST(
    new Request("https://petbooking.test/api/v1/auth/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
}

async function enableOwner() {
  const passwordHash = await hashPassword(password);
  await env.db
    .update(staffUser)
    .set({ email: "owner@example.test", passwordHash, status: "active" })
    .where(eq(staffUser.id, env.base.staff.owner));
  return passwordHash;
}

beforeEach(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  vi.stubEnv("NODE_ENV", "production");
  env = await setupTestDb();
  resetRateLimits();
});
afterEach(async () => {
  resetRateLimits();
  await env.close();
  vi.unstubAllEnvs();
});

describe("POST /api/v1/auth/staff/login", () => {
  it("normalizes email, returns StaffMe and creates a secure sliding staff session", async () => {
    await enableOwner();
    const res = await request({ email: "  OWNER@Example.Test ", password });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(AuthStaffLoginResponse.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      staff: {
        id: env.base.staff.owner,
        displayName: "owner",
        email: "owner@example.test",
        role: "owner",
        isGroomer: false,
        lineLinked: false,
      },
      organization: { id: env.base.orgId, name: "Shop a", status: "active" },
      branch: {
        id: env.base.branchId,
        name: "Shop a",
        bookingSlug: "shop-a",
        timezone: "Asia/Bangkok",
        modules: { grooming: true, hotel: false, daycare: false },
      },
      permissions: expect.arrayContaining(["staffMe.sessions"]),
      supportMode: false,
    });
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/^sid=[^;]+;.*HttpOnly;.*SameSite=Lax;.*Secure/);
    if (!cookie) throw new Error("Expected session cookie");
    const tokenValue = cookie.slice(4).split(";")[0];
    if (!tokenValue) throw new Error("Expected session token");
    const token = decodeURIComponent(tokenValue);
    const [stored] = await env.db
      .select()
      .from(session)
      .where(eq(session.tokenHash, hashToken(token)));
    expect(stored?.subjectType).toBe("staff");
    expect(stored?.subjectId).toBe(env.base.staff.owner);
    if (!stored) throw new Error("Expected persisted session");
    expect(stored.lastSeenAt).toBeInstanceOf(Date);
    expect(stored.expiresAt.getTime()).toBe(stored.lastSeenAt.getTime() + SESSION_TTL_MS.staff);
    expect(await lookupSession(env.db, token, stored.lastSeenAt)).toMatchObject({ id: stored.id });
    const [staff] = await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.owner));
    expect(staff?.lastLoginAt).toEqual(stored?.lastSeenAt);
    expect(staff?.failedLoginCount).toBe(0);
  });

  it("uses the same invalid-credentials response for unknown and incorrect passwords", async () => {
    await enableOwner();
    for (const email of ["missing@example.test", "owner@example.test"]) {
      const res = await request({ email, password: "wrong-password" });
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("INVALID_CREDENTIALS");
    }
    const [staff] = await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.owner));
    expect(staff?.failedLoginCount).toBe(1);
  });

  it("persists the lockout on the fifth consecutive wrong password", async () => {
    await enableOwner();
    const attemptedAt = Date.now();
    let last!: Response;
    for (let i = 0; i < 5; i++) last = await request({ email: "owner@example.test", password: "wrong-password" });
    expect(await errorCode(last)).toBe("ACCOUNT_LOCKED");
    const [staff] = await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.owner));
    expect(staff?.failedLoginCount).toBe(0);
    expect(staff?.lockedUntil?.getTime()).toBeGreaterThanOrEqual(attemptedAt + 15 * 60_000);
    expect(staff?.lockedUntil?.getTime()).toBeLessThan(attemptedAt + 15 * 60_000 + 5_000);
  });

  it("rejects an account that is already locked", async () => {
    await enableOwner();
    await env.db
      .update(staffUser)
      .set({ lockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(staffUser.id, env.base.staff.owner));
    const res = await request({ email: "owner@example.test", password });
    expect(res.status).toBe(423);
    expect(await errorCode(res)).toBe("ACCOUNT_LOCKED");
  });

  it("returns VALIDATION_FAILED for missing, malformed and overlong inputs", async () => {
    for (const body of [{}, { email: "bad", password }, { email: "owner@example.test", password: "x".repeat(129) }]) {
      const res = await request(body);
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_FAILED");
    }
  });

  it("rate limits the eleventh request from one IP", async () => {
    await enableOwner();
    let response!: Response;
    for (let i = 0; i < 11; i++)
      response = await request({ email: "unknown@example.test", password: "PawsAndPuppies42!" }, "198.51.100.77");
    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("RATE_LIMITED");
  });
});
