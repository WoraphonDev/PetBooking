import { AdminSupportStartRequest, AdminSupportStartResponse } from "@app/contracts/endpoints/admin.supportStart";
import { AuthMeRequest } from "@app/contracts/endpoints/auth.me";
import { ClosuresCreateRequest } from "@app/contracts/endpoints/closures.create";
import { auditLog, notification, platformAdmin, session, staffUser, supportAccessLog } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits, withAdmin, withStaff } from "../../../src/http.ts";
import { adminSupportStart } from "../../../src/services/admin/supportStart.ts";
import { authMe } from "../../../src/services/auth/me.ts";
import { closuresCreate } from "../../../src/services/closures/create.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let adminId: string;
let token: string;
const POST = withAdmin("admin.supportStart", { body: AdminSupportStartRequest }, adminSupportStart);
const reason = "ลูกค้าแจ้งว่าปฏิทินไม่แสดงคิว";
const ctx = () => ({ ...makeSystemCtx(null, TEST_NOW), actor: { type: "admin" as const, id: adminId } });
const noHttp = { session: null, setCookie: () => {} };

const start = (body: unknown, cookie = `aid=${token}`) =>
  POST(
    new Request("https://petbooking.test/api/v1/admin/support-sessions", {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );
const sidFrom = (response: Response) => /sid=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1] ?? "";

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

it("opens support mode: log row, sid cookie and redirect to the console", async () => {
  const response = await start({ organizationId: env.base.orgId, reason, ticketRef: "FB-12" });
  expect(response.status).toBe(200);
  expect(AdminSupportStartResponse.parse(await response.json())).toEqual({ redirectUrl: "/console" });
  expect(sidFrom(response)).not.toBe("");
  const [log] = await env.db.select().from(supportAccessLog);
  expect(log).toMatchObject({
    organizationId: env.base.orgId,
    platformAdminId: adminId,
    reason,
    ticketRef: "FB-12",
    readOnly: true,
    endedAt: null,
  });
  const [row] = await env.db
    .select()
    .from(session)
    .where(eq(session.supportAccessLogId, log?.id ?? ""));
  expect(row).toMatchObject({
    subjectType: "platform_admin",
    subjectId: adminId,
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
  });
});

it("lasts 60 minutes from ctx.now and stamps the log", async () => {
  await adminSupportStart(ctx(), { organizationId: env.base.orgId, reason }, noHttp);
  const [log] = await env.db.select().from(supportAccessLog);
  expect(log).toMatchObject({ startedAt: TEST_NOW, ticketRef: null });
  const [row] = await env.db
    .select()
    .from(session)
    .where(eq(session.supportAccessLogId, log?.id ?? ""));
  expect(row?.expiresAt).toEqual(new Date(TEST_NOW.getTime() + 60 * 60_000));
});

it("lets the support session read like an owner but refuses every write with SUPPORT_READ_ONLY", async () => {
  const sid = sidFrom(await start({ organizationId: env.base.orgId, reason }));
  const me = withStaff("auth.me", { query: AuthMeRequest }, authMe);
  const read = await me(new Request("https://petbooking.test/api/v1/auth/staff/me", { headers: { cookie: `sid=${sid}` } }));
  expect(read.status).toBe(200);
  // reads go through like an owner (Q-0007); most services' requireRole still refuses an admin actor (Q-0033)
  expect(await read.json()).toMatchObject({ staff: { id: adminId, role: "owner" } });
  const write = await withStaff(
    "closures.create",
    { body: ClosuresCreateRequest },
    closuresCreate,
  )(
    new Request("https://petbooking.test/api/v1/staff/branch/closures", {
      method: "POST",
      headers: { cookie: `sid=${sid}`, origin: "https://petbooking.test", "content-type": "application/json" },
      body: JSON.stringify({ startsAt: "2026-10-06T02:00:00.000Z", endsAt: "2026-10-06T05:00:00.000Z", scope: "all" }),
    }),
  );
  expect(write.status).toBe(403);
  expect(await write.json()).toMatchObject({ error: { code: "SUPPORT_READ_ONLY" } });
});

it("writes audit support.session_start in the shop, flagged as via support", async () => {
  await adminSupportStart(ctx(), { organizationId: env.base.orgId, reason, ticketRef: "FB-12" }, noHttp);
  const [log] = await env.db.select().from(supportAccessLog);
  expect(await env.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      action: "support.session_start",
      actorType: "platform_admin",
      actorId: adminId,
      entityType: "support_access_log",
      entityId: log?.id,
      supportAccessLogId: log?.id,
      after: { reason, ticketRef: "FB-12" },
    }),
  ]);
});

it("queues owner.support_access for every active owner (dedupe support_access:{id}:{owner})", async () => {
  const [second, disabled] = await env.db
    .insert(staffUser)
    .values([
      { organizationId: env.base.orgId, email: "owner2@a.test", displayName: "owner 2", role: "owner", status: "active" },
      { organizationId: env.base.orgId, email: "owner3@a.test", displayName: "owner 3", role: "owner", status: "disabled" },
    ])
    .returning();
  await adminSupportStart(ctx(), { organizationId: env.base.orgId, reason }, noHttp);
  const [log] = await env.db.select().from(supportAccessLog);
  const rows = await env.db.select().from(notification);
  const owners = [env.base.staff.owner, second?.id ?? ""];
  expect(rows.map((r) => r.recipientId).sort()).toEqual([...owners].sort());
  expect(rows.map((r) => r.recipientId)).not.toContain(disabled?.id);
  for (const r of rows)
    expect(r).toMatchObject({
      organizationId: env.base.orgId,
      templateKey: "owner.support_access",
      recipientType: "staff",
      dedupeKey: `support_access:${log?.id}:${r.recipientId}`,
      payload: { reason },
    });
});

it("rejects missing and malformed fields with VALIDATION_FAILED, without opening anything", async () => {
  for (const body of [
    {},
    { reason },
    { organizationId: "x", reason },
    { organizationId: env.base.orgId },
    { organizationId: env.base.orgId, reason: "สั้นไป" },
  ]) {
    const response = await start(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(supportAccessLog)).toEqual([]);
});

it("returns NOT_FOUND for an unknown organization", async () => {
  const response = await start({ organizationId: "00000000-0000-4000-8000-000000000000", reason });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  expect(await env.db.select().from(session).where(eq(session.subjectType, "platform_admin"))).toHaveLength(1);
});

it("is not open to a staff session", async () => {
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    TEST_NOW,
  );
  const response = await start({ organizationId: env.base.orgId, reason }, `sid=${staff.token}`);
  expect(response.status).toBe(401);
  expect(await env.db.select().from(supportAccessLog)).toEqual([]);
});
