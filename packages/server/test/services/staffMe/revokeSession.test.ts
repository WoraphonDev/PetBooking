import { StaffMeRevokeSessionParams, StaffMeRevokeSessionRequest } from "@app/contracts/endpoints/staffMe.revokeSession";
import { session } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { staffMeRevokeSession } from "../../../src/services/staffMe/revokeSession.ts";
import { otherOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const DELETE = withStaff(
  "staffMe.revokeSession",
  { body: StaffMeRevokeSessionRequest, params: StaffMeRevokeSessionParams },
  staffMeRevokeSession,
);
let env: TestEnv;
beforeEach(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

const login = (subjectId: string, organizationId = env.base.orgId) =>
  createSession(env.db, { subjectType: "staff", subjectId, organizationId, branchId: env.base.branchId }, new Date());
const request = (token: string, sessionId: string) =>
  DELETE(
    new Request(`https://petbooking.test/api/v1/staff/me/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { origin: "https://petbooking.test", cookie: `sid=${token}` },
    }),
    { params: { sessionId } },
  );
const exists = async (id: string) => (await env.db.select().from(session).where(eq(session.id, id))).length === 1;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

it.each(["owner", "front_desk", "staff"] as const)("signs out another of the caller's devices with 204 for %s", async (role) => {
  const current = await login(env.base.staff[role]);
  const other = await login(env.base.staff[role]);
  const response = await request(current.token, other.session.id);
  expect(response.status).toBe(204);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await exists(other.session.id)).toBe(false);
  expect(await exists(current.session.id)).toBe(true);
});

it("clears the cookie when the caller revokes the current device", async () => {
  const current = await login(env.base.staff.owner);
  const response = await request(current.token, current.session.id);
  expect(response.status).toBe(204);
  expect(response.headers.get("set-cookie")).toMatch(/^sid=;/);
  expect(await exists(current.session.id)).toBe(false);
});

it("returns NOT_FOUND for a colleague's, another organization's or an unknown session", async () => {
  const other = await otherOrg(env.db);
  const current = await login(env.base.staff.owner);
  const colleague = await login(env.base.staff.staff);
  const foreign = await createSession(
    env.db,
    { subjectType: "staff", subjectId: other.staff.owner, organizationId: other.orgId },
    new Date(),
  );
  for (const id of [colleague.session.id, foreign.session.id, "00000000-0000-4000-8000-000000000000"]) {
    const response = await request(current.token, id);
    expect(response.status).toBe(404);
    expect(await code(response)).toBe("NOT_FOUND");
  }
  expect(await exists(colleague.session.id)).toBe(true);
  expect(await exists(foreign.session.id)).toBe(true);
});

it("rejects a malformed session id with VALIDATION_FAILED", async () => {
  const current = await login(env.base.staff.owner);
  const response = await request(current.token, "not-a-uuid");
  expect(response.status).toBe(422);
  expect(await code(response)).toBe("VALIDATION_FAILED");
});
