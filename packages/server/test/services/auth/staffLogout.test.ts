import { AuthStaffLogoutRequest, AuthStaffLogoutResponse } from "@app/contracts/endpoints/auth.staffLogout";
import { session } from "@app/db/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { authStaffLogout } from "../../../src/services/auth/staffLogout.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("auth.staffLogout", { body: AuthStaffLogoutRequest }, authStaffLogout);
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

it("logs out each staff role, clears sid and preserves other sessions", async () => {
  for (const role of ["owner", "front_desk", "staff"] as const) {
    const current = await createSession(
      env.db,
      { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId },
      new Date(),
    );
    const other = await createSession(
      env.db,
      { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId },
      new Date(),
    );
    const response = await POST(
      new Request("https://petbooking.test/api/v1/auth/staff/logout", {
        method: "POST",
        headers: { cookie: `sid=${current.token}`, origin: "https://petbooking.test" },
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(AuthStaffLogoutResponse.safeParse(undefined).success).toBe(true);
    expect(response.headers.get("set-cookie")).toMatch(/^sid=;.*Expires=Thu, 01 Jan 1970/);
    const rows = await env.db.select().from(session);
    expect(rows.some((row) => row.id === current.session.id)).toBe(false);
    expect(rows.some((row) => row.id === other.session.id)).toBe(true);
  }
});
it("rejects a foreign-organization session without deleting it or clearing cookies", async () => {
  const foreign = await otherOrg(env.db);
  const created = await createSession(
    env.db,
    { subjectType: "staff", subjectId: foreign.staff.owner, organizationId: foreign.orgId },
    TEST_NOW,
  );
  const setCookie = vi.fn();
  await expect(authStaffLogout(staffCtx(env.base, "owner"), {}, { session: created.session, setCookie })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(setCookie).not.toHaveBeenCalled();
  expect(await env.db.select().from(session)).toHaveLength(1);
});
it("denies unauthenticated requests", async () => {
  const response = await POST(new Request("https://petbooking.test/api/v1/auth/staff/logout", { method: "POST" }));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
});
it("denies customer actors and rejects a customer session presented as sid", async () => {
  const current = await createSession(
    env.db,
    { subjectType: "customer", subjectId: env.base.ownerProfileId, organizationId: env.base.orgId },
    new Date(),
  );
  const setCookie = vi.fn();
  await expect(authStaffLogout(customerCtx(env.base), {}, { session: current.session, setCookie })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const response = await POST(
    new Request("https://petbooking.test/api/v1/auth/staff/logout", {
      method: "POST",
      headers: { cookie: `sid=${current.token}`, origin: "https://petbooking.test" },
    }),
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  expect(setCookie).not.toHaveBeenCalled();
  expect(await env.db.select().from(session)).toHaveLength(1);
});
it("rejects malformed JSON with VALIDATION_FAILED", async () => {
  const created = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId },
    new Date(),
  );
  const response = await POST(
    new Request("https://petbooking.test/api/v1/auth/staff/logout", {
      method: "POST",
      headers: { cookie: `sid=${created.token}`, origin: "https://petbooking.test" },
      body: "{",
    }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  expect(await env.db.select().from(session)).toHaveLength(1);
});
