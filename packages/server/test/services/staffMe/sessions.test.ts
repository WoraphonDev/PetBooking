import { StaffMeSessionsRequest, StaffMeSessionsResponse } from "@app/contracts/endpoints/staffMe.sessions";
import { session } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { staffMeSessions } from "../../../src/services/staffMe/sessions.ts";
import { otherOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("staffMe.sessions", { query: StaffMeSessionsRequest }, staffMeSessions);
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
});
afterEach(async () => {
  await env.close();
});

const login = (subjectId: string, organizationId = env.base.orgId, userAgent: string | null = null, at = new Date()) =>
  createSession(env.db, { subjectType: "staff", subjectId, organizationId, branchId: env.base.branchId, userAgent }, at);
const request = (token: string, qs = "") =>
  GET(new Request(`https://petbooking.test/api/v1/staff/me/sessions${qs}`, { headers: { cookie: `sid=${token}` } }));

it.each(["owner", "front_desk", "staff"] as const)("lists only the caller's unexpired sessions with every field for %s", async (role) => {
  const me = env.base.staff[role];
  const older = await login(me, env.base.orgId, "Safari iPad", new Date(Date.now() - 60_000));
  const expired = await login(me, env.base.orgId, "Old phone");
  await env.db
    .update(session)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(session.id, expired.session.id));
  await login(env.base.staff[role === "owner" ? "staff" : "owner"], env.base.orgId, "Colleague");
  const current = await login(me, env.base.orgId, "Chrome Mac");

  const response = await request(current.token);
  expect(response.status).toBe(200);
  const body = StaffMeSessionsResponse.parse(await response.json());
  const rows = await env.db.select().from(session);
  const row = (id: string) => rows.find((r) => r.id === id);
  expect(body).toEqual([
    { id: current.session.id, userAgent: "Chrome Mac", lastSeenAt: row(current.session.id)?.lastSeenAt.toISOString(), current: true },
    { id: older.session.id, userAgent: "Safari iPad", lastSeenAt: row(older.session.id)?.lastSeenAt.toISOString(), current: false },
  ]);
});

it("never lists another organization's sessions", async () => {
  const other = await otherOrg(env.db);
  await createSession(env.db, { subjectType: "staff", subjectId: other.staff.owner, organizationId: other.orgId }, new Date());
  const mine = await login(env.base.staff.owner);
  const body = StaffMeSessionsResponse.parse(await (await request(mine.token)).json());
  expect(body.map((s) => s.id)).toEqual([mine.session.id]);
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const mine = await login(env.base.staff.owner);
  const response = await request(mine.token, "?subjectId=x");
  expect(response.status).toBe(422);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});

it("requires a staff session", async () => {
  expect((await request("missing")).status).toBe(401);
});
