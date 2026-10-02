import { ReportsCommissionsQuery, ReportsCommissionsResponse } from "@app/contracts/endpoints/reports.commissions";
import { bill, billLine, branch, commissionEntry, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { reportsCommissions } from "../../../src/services/reports/commissions.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withStaff("reports.commissions", { query: ReportsCommissionsQuery }, reportsCommissions);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  await env.db.update(staffUser).set({ displayName: "ข้าวหอม" }).where(eq(staffUser.id, env.base.staff.staff));
  await env.db.update(staffUser).set({ displayName: "กล้วย" }).where(eq(staffUser.id, env.base.staff.front_desk));
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(commissionEntry);
  resetRateLimits();
});
async function get(query: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/staff/reports/commissions${query}`, { headers: { cookie: `sid=${login.token}` } }),
  );
}
/** One commission entry with its own bill line. Times are UTC; Bangkok = +7. */
async function entry(
  org: SeedOrg,
  staffUserId: string,
  earnedAt: string,
  amountSatang: number,
  baseSatang: number,
  reversedAt: string | null = null,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [b] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner })
    .returning();
  const [line] = await env.db
    .insert(billLine)
    .values({
      organizationId: org.orgId,
      billId: b?.id ?? "",
      lineType: "groom_service",
      description: "อาบน้ำ",
      unitPriceSatang: baseSatang,
      lineTotalSatang: baseSatang,
    })
    .returning();
  const [row] = await env.db
    .insert(commissionEntry)
    .values({
      ...tenant,
      staffUserId,
      billId: b?.id ?? "",
      billLineId: line?.id ?? "",
      baseSatang,
      amountSatang,
      status: reversedAt ? "reversed" : "earned",
      earnedAt: new Date(earnedAt),
      reversedAt: reversedAt ? new Date(reversedAt) : null,
    })
    .returning();
  return row?.id ?? "";
}
const october = "?from=2026-10-01&to=2026-10-31";

it("groups every staff member's entries with every CommissionReport field, ordered by name", async () => {
  const s = env.base.staff.staff;
  const f = env.base.staff.front_desk;
  const s1 = await entry(env.base, s, "2026-09-30T17:00:00.000Z", 1000, 10000); // 2026-10-01 00:00 Bangkok
  const s2 = await entry(env.base, s, "2026-10-31T16:59:59.000Z", 2500, 20000); // 2026-10-31 23:59:59 Bangkok
  const f1 = await entry(env.base, f, "2026-10-10T03:00:00.000Z", 700, 7000);
  await entry(env.base, s, "2026-09-30T16:59:59.000Z", 9999, 9999); // 2026-09-30 Bangkok
  await entry(env.base, f, "2026-10-31T17:00:00.000Z", 9999, 9999); // 2026-11-01 Bangkok
  const response = await get(october);
  expect(response.status).toBe(200);
  expect(ReportsCommissionsResponse.parse(await response.json())).toEqual({
    from: "2026-10-01",
    to: "2026-10-31",
    rows: [
      { staffUserId: f, staffName: "กล้วย", jobs: 1, baseSatang: 7000, amountSatang: 700, entries: [f1] },
      { staffUserId: s, staffName: "ข้าวหอม", jobs: 2, baseSatang: 30000, amountSatang: 3500, entries: [s1, s2] },
    ],
  });
});

it("counts reversals in the period they happen: earned +, reversed −", async () => {
  const s = env.base.staff.staff;
  const kept = await entry(env.base, s, "2026-10-05T03:00:00.000Z", 1000, 10000);
  const sameMonth = await entry(env.base, s, "2026-10-06T03:00:00.000Z", 2000, 20000, "2026-10-07T03:00:00.000Z");
  const lateVoid = await entry(env.base, s, "2026-09-20T03:00:00.000Z", 3000, 30000, "2026-10-08T03:00:00.000Z");
  const oct = ReportsCommissionsResponse.parse(await (await get(october)).json());
  expect(oct.rows).toEqual([
    { staffUserId: s, staffName: "ข้าวหอม", jobs: 0, baseSatang: -20000, amountSatang: -2000, entries: [lateVoid, kept, sameMonth] },
  ]);
  const sep = ReportsCommissionsResponse.parse(await (await get("?from=2026-09-01&to=2026-09-30")).json());
  expect(sep.rows[0]).toMatchObject({ jobs: 1, baseSatang: 30000, amountSatang: 3000, entries: [lateVoid] });
});

it("returns no rows for an empty period and uses the branch timezone", async () => {
  expect(ReportsCommissionsResponse.parse(await (await get(october)).json()).rows).toEqual([]);
  await env.db.update(branch).set({ timezone: "America/New_York" }).where(eq(branch.id, env.base.branchId));
  const id = await entry(env.base, env.base.staff.staff, "2026-10-01T03:00:00.000Z", 1000, 10000); // 2026-09-30 23:00 New York
  const ctx = staffCtx(env.base, "owner");
  expect((await reportsCommissions(ctx, { from: "2026-10-01", to: "2026-10-01" })).rows).toEqual([]);
  expect((await reportsCommissions(ctx, { from: "2026-09-30", to: "2026-09-30" })).rows[0]?.entries).toEqual([id]);
  await env.db.update(branch).set({ timezone: "Asia/Bangkok" }).where(eq(branch.id, env.base.branchId));
});

it("rejects missing, malformed and inverted ranges", async () => {
  for (const query of [
    "",
    "?from=2026-10-01",
    "?to=2026-10-31",
    "?from=01-10-2026&to=2026-10-31",
    "?from=2026-02-30&to=2026-03-01",
    "?from=2026-10-02&to=2026-10-01",
  ]) {
    const response = await get(query);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await get(october, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("denies absent sessions and customer actors", async () => {
  expect((await GET(new Request(`https://petbooking.test/api/v1/staff/reports/commissions${october}`))).status).toBe(401);
  await expect(reportsCommissions(customerCtx(env.base), { from: "2026-10-01", to: "2026-10-31" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's branch and never includes its entries", async () => {
  const foreign = await otherOrg(env.db);
  await entry(foreign, foreign.staff.staff, "2026-10-05T03:00:00.000Z", 1000, 10000);
  for (const branchId of [foreign.branchId, null]) {
    await expect(
      reportsCommissions({ ...staffCtx(env.base, "owner"), branchId }, { from: "2026-10-01", to: "2026-10-31" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  expect((await reportsCommissions(staffCtx(env.base, "owner"), { from: "2026-10-01", to: "2026-10-31" })).rows).toEqual([]);
});
