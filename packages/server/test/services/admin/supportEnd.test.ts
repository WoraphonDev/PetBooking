import { AdminSupportEndRequest } from "@app/contracts/endpoints/admin.supportEnd";
import { AuthMeRequest } from "@app/contracts/endpoints/auth.me";
import { auditLog, platformAdmin, session, supportAccessLog } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits, withAdmin, withStaff } from "../../../src/http.ts";
import { adminSupportEnd } from "../../../src/services/admin/supportEnd.ts";
import { adminSupportStart } from "../../../src/services/admin/supportStart.ts";
import { authMe } from "../../../src/services/auth/me.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let adminId: string;
let token: string;
const POST = withAdmin("admin.supportEnd", { params: AdminSupportEndRequest }, adminSupportEnd);
const ctx = () => ({ ...makeSystemCtx(null, TEST_NOW), actor: { type: "admin" as const, id: adminId } });
const end = (supportId: string) =>
  POST(
    new Request(`https://petbooking.test/api/v1/admin/support-sessions/${supportId}/end`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", cookie: `aid=${token}` },
    }),
    { params: Promise.resolve({ supportId }) },
  );
async function open() {
  let sid = "";
  await adminSupportStart(
    ctx(),
    { organizationId: env.base.orgId, reason: "ตรวจสอบปัญหาการจอง" },
    { session: null, setCookie: (c) => (sid = c.value) },
  );
  const [log] = await env.db.select().from(supportAccessLog);
  return { supportId: log?.id ?? "", sid };
}

beforeEach(async () => {
  // the HTTP pipeline reads the clock once per request: pin it to TEST_NOW so the 12 h admin session stays valid
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TEST_NOW);
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  resetRateLimits();
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "x" })
    .returning();
  adminId = admin?.id ?? "";
  token = (await createSession(env.db, { subjectType: "platform_admin", subjectId: adminId }, TEST_NOW)).token;
});
afterEach(async () => {
  vi.useRealTimers();
  await env.close();
  vi.unstubAllEnvs();
});

it("ends support mode with 204: ended_at set and the support session gone", async () => {
  const { supportId, sid } = await open();
  const response = await end(supportId);
  expect(response.status).toBe(204);
  const [log] = await env.db.select().from(supportAccessLog).where(eq(supportAccessLog.id, supportId));
  expect(log?.endedAt).toBeInstanceOf(Date);
  expect(await env.db.select().from(session).where(eq(session.supportAccessLogId, supportId))).toEqual([]);
  const me = withStaff("auth.me", { query: AuthMeRequest }, authMe);
  const read = await me(new Request("https://petbooking.test/api/v1/auth/staff/me", { headers: { cookie: `sid=${sid}` } }));
  expect(read.status).toBe(401);
  // the admin's own session is untouched
  expect(await env.db.select().from(session).where(eq(session.subjectId, adminId))).toHaveLength(1);
});

it("writes audit support.session_end once, stamped with ctx.now; ending again is a no-op", async () => {
  const { supportId } = await open();
  await adminSupportEnd(ctx(), { supportId });
  await adminSupportEnd(ctx(), { supportId });
  const [log] = await env.db.select().from(supportAccessLog).where(eq(supportAccessLog.id, supportId));
  expect(log?.endedAt).toEqual(TEST_NOW);
  const ends = (await env.db.select().from(auditLog)).filter((a) => a.action === "support.session_end");
  expect(ends).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      actorType: "platform_admin",
      actorId: adminId,
      entityType: "support_access_log",
      entityId: supportId,
      supportAccessLogId: supportId,
    }),
  ]);
});

it("rejects a malformed supportId with VALIDATION_FAILED", async () => {
  const response = await end("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("returns NOT_FOUND for an unknown support session", async () => {
  const response = await end("00000000-0000-4000-8000-000000000000");
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
