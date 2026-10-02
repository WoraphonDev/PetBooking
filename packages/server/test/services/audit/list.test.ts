import { AuditListRequest, AuditListResponse } from "@app/contracts/endpoints/audit.list";
import { auditLog, platformAdmin, supportAccessLog } from "@app/db/schema";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { auditList } from "../../../src/services/audit/list.ts";
import { otherOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("audit.list", { query: AuditListRequest }, auditList);
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
});
afterEach(async () => {
  await env.close();
});

async function token(role: "owner" | "front_desk" | "staff", base = env.base) {
  return (
    await createSession(
      env.db,
      { subjectType: "staff", subjectId: base.staff[role], organizationId: base.orgId, branchId: base.branchId },
      new Date(),
    )
  ).token;
}
const request = (sid: string, qs = "") =>
  GET(new Request(`https://petbooking.test/api/v1/staff/audit-logs${qs}`, { headers: { cookie: `sid=${sid}` } }));
const list = async (sid: string, qs = "") => {
  const response = await request(sid, qs);
  expect(response.status).toBe(200);
  return AuditListResponse.parse(await response.json());
};
const log = (at: string, overrides: Partial<typeof auditLog.$inferInsert> = {}) => ({
  organizationId: env.base.orgId,
  actorType: "staff" as const,
  actorId: env.base.staff.owner,
  action: "policy.update",
  entityType: "branch_policy",
  entityId: env.base.branchId,
  createdAt: new Date(at),
  ...overrides,
});

it("maps every AuditLogItem field (actor names from staff_user / platform_admin, viaSupport), newest first", async () => {
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin A", passwordHash: "x" })
    .returning();
  const [support] = await env.db
    .insert(supportAccessLog)
    .values({
      organizationId: env.base.orgId,
      platformAdminId: admin?.id ?? "",
      reason: "help",
      startedAt: new Date("2026-10-04T00:00:00Z"),
    })
    .returning();
  const [staffRow, adminRow, systemRow] = await env.db
    .insert(auditLog)
    .values([
      log("2026-10-04T01:00:00.000Z", { before: { deposit: 0 }, after: { deposit: 100 }, reason: "ปรับมัดจำ", ip: "203.0.113.1" }),
      log("2026-10-04T02:00:00.000Z", {
        actorType: "platform_admin",
        actorId: admin?.id,
        action: "support.session_start",
        supportAccessLogId: support?.id,
      }),
      log("2026-10-04T03:00:00.000Z", { actorType: "system", actorId: null, action: "data.export", entityId: null }),
    ])
    .returning();
  const body = await list(await token("owner"));
  expect(body).toEqual({
    nextCursor: null,
    items: [
      {
        id: systemRow?.id,
        action: "data.export",
        actorType: "system",
        actorName: null,
        entityType: "branch_policy",
        entityId: null,
        before: null,
        after: null,
        reason: null,
        at: "2026-10-04T03:00:00.000Z",
        viaSupport: false,
      },
      expect.objectContaining({ id: adminRow?.id, actorType: "platform_admin", actorName: "Admin A", viaSupport: true }),
      {
        id: staffRow?.id,
        action: "policy.update",
        actorType: "staff",
        actorName: "owner",
        entityType: "branch_policy",
        entityId: env.base.branchId,
        before: { deposit: 0 },
        after: { deposit: 100 },
        reason: "ปรับมัดจำ",
        at: "2026-10-04T01:00:00.000Z",
        viaSupport: false,
      },
    ],
  });
});

it("filters by action and by inclusive local dates in the branch timezone", async () => {
  await env.db.insert(auditLog).values([
    // 2026-10-03 23:30 Bangkok
    log("2026-10-03T16:30:00.000Z"),
    // 2026-10-04 00:30 Bangkok
    log("2026-10-03T17:30:00.000Z", { action: "bill.void" }),
    // 2026-10-05 23:59 Bangkok
    log("2026-10-05T16:59:00.000Z"),
    // 2026-10-06 00:00 Bangkok
    log("2026-10-05T17:00:00.000Z"),
  ]);
  const ranged = await list(await token("owner"), "?from=2026-10-04&to=2026-10-05");
  expect(ranged.items.map((i) => i.at)).toEqual(["2026-10-05T16:59:00.000Z", "2026-10-03T17:30:00.000Z"]);
  const voids = await list(await token("owner"), "?action=bill.void");
  expect(voids.items.map((i) => i.action)).toEqual(["bill.void"]);
});

it("pages with an opaque cursor without gaps or repeats (ties broken by id)", async () => {
  await env.db.insert(auditLog).values([0, 1, 2, 3, 4].map((i) => log(`2026-10-04T0${i % 3}:00:00.000Z`)));
  const sid = await token("owner");
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page: AuditListResponse = await list(sid, `?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
    expect(page.items.length).toBeLessThanOrEqual(2);
    seen.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor;
  } while (cursor);
  const all = await list(sid, "?limit=200");
  expect(seen).toEqual(all.items.map((i) => i.id));
  expect(new Set(seen).size).toBe(5);
});

it("never returns another organization's audit rows", async () => {
  const other = await otherOrg(env.db);
  await env.db.insert(auditLog).values(log("2026-10-04T01:00:00.000Z", { organizationId: other.orgId, actorId: other.staff.owner }));
  expect((await list(await token("owner"))).items).toEqual([]);
  expect((await list(await token("owner", other))).items).toHaveLength(1);
});

it.each(["?from=04-10-2026", "?to=2026-13-01", "?from=2026-02-30", "?from=2026-10-05&to=2026-10-04", "?limit=0", "?limit=201", "?cursor=bm9wZQ"])(
  "rejects %s with VALIDATION_FAILED",
  async (qs) => {
    const response = await request(await token("owner"), qs);
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  },
);

it.each(["front_desk", "staff"] as const)("forbids %s", async (role) => {
  const response = await request(await token(role));
  expect(response.status).toBe(403);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
});
