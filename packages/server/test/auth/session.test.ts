import { session } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearSessionCookie, sessionCookie } from "../../src/auth/cookies.ts";
import { createSession, hashToken, lookupSession, revokeAllFor, revokeSession, SESSION_TTL_MS } from "../../src/auth/session.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(async () => env.close());

const at = (ms: number) => new Date(TEST_NOW.getTime() + ms);
const HOUR = 60 * 60 * 1000;
const staff = () => ({ subjectType: "staff" as const, subjectId: env.base.staff.owner, organizationId: env.base.orgId });

describe("sessions", () => {
  it("stores only the sha256 of a 32-byte base64url token", async () => {
    const { token, session: row } = await createSession(env.db, staff(), TEST_NOW);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.expiresAt).toEqual(at(SESSION_TTL_MS.staff));
  });

  it("lookup: unknown → null, valid → row, expired → null", async () => {
    const { token } = await createSession(env.db, staff(), TEST_NOW);
    expect(await lookupSession(env.db, "not-a-token", TEST_NOW)).toBeNull();
    expect((await lookupSession(env.db, token, at(HOUR)))?.subjectId).toBe(env.base.staff.owner);
    const { token: adminToken } = await createSession(env.db, { subjectType: "platform_admin", subjectId: env.base.staff.owner }, TEST_NOW);
    expect(await lookupSession(env.db, adminToken, at(12 * HOUR - 1))).not.toBeNull();
    expect(await lookupSession(env.db, adminToken, at(12 * HOUR))).toBeNull();
  });

  it("staff sessions slide; customer sessions keep their expiry", async () => {
    const { token } = await createSession(env.db, staff(), TEST_NOW);
    const slid = await lookupSession(env.db, token, at(29 * 24 * HOUR));
    expect(slid?.expiresAt).toEqual(at(29 * 24 * HOUR + SESSION_TTL_MS.staff));
    expect(slid?.lastSeenAt).toEqual(at(29 * 24 * HOUR));
    expect(await lookupSession(env.db, token, at(31 * 24 * HOUR))).not.toBeNull();

    const cust = await createSession(
      env.db,
      { subjectType: "customer", subjectId: env.base.ownerProfileId, organizationId: env.base.orgId, branchId: env.base.branchId },
      TEST_NOW,
    );
    expect((await lookupSession(env.db, cust.token, at(HOUR)))?.expiresAt).toEqual(at(SESSION_TTL_MS.customer));
    expect(await lookupSession(env.db, cust.token, at(SESSION_TTL_MS.customer))).toBeNull();
  });

  it("revokeSession deletes one session; revokeAllFor deletes only that subject's sessions", async () => {
    const a = await createSession(env.db, staff(), TEST_NOW);
    const b = await createSession(env.db, staff(), TEST_NOW);
    const other = await createSession(env.db, { ...staff(), subjectId: env.base.staff.staff }, TEST_NOW);
    await revokeSession(env.db, a.session.id);
    expect(await lookupSession(env.db, a.token, TEST_NOW)).toBeNull();
    expect(await lookupSession(env.db, b.token, TEST_NOW)).not.toBeNull();
    await revokeAllFor(env.db, { type: "staff", id: env.base.staff.owner });
    expect(
      await env.db
        .select()
        .from(session)
        .where(and(eq(session.subjectType, "staff"), eq(session.subjectId, env.base.staff.owner))),
    ).toEqual([]);
    expect(await lookupSession(env.db, other.token, TEST_NOW)).not.toBeNull();
  });
});

describe("cookies", () => {
  it("sid / cid / aid with HttpOnly, Secure, SameSite=Lax, Path=/", () => {
    const c = sessionCookie("staff", "tok", at(HOUR));
    expect(c).toEqual({
      name: "sid",
      value: "tok",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: at(HOUR) },
    });
    expect(sessionCookie("customer", "t", TEST_NOW).name).toBe("cid");
    expect(sessionCookie("platform_admin", "t", TEST_NOW).name).toBe("aid");
    expect(clearSessionCookie("staff")).toMatchObject({ name: "sid", value: "", options: { expires: new Date(0) } });
  });
});
