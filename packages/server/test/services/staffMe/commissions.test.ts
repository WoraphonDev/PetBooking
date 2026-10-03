import { StaffMeCommissionsQuery, StaffMeCommissionsResponse } from "@app/contracts/endpoints/staffMe.commissions";
import { bill, billLine, branch, commissionEntry } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staffMeCommissions } from "../../../src/services/staffMe/commissions.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

/** entries as their ids (Q-0077 items carry details; these tests check which events are counted) */
const asIds = <R extends { entries: { id: string }[] }>(rows: R[]) => rows.map((r) => ({ ...r, entries: r.entries.map((e) => e.id) }));

let env: TestEnv;
const GET = withStaff("staffMe.commissions", { query: StaffMeCommissionsQuery }, staffMeCommissions);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(commissionEntry);
  resetRateLimits();
});
async function get(query: string, role: "owner" | "front_desk" | "staff" = "staff") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/me/commissions${query}`, { headers: { cookie: `sid=${login.token}` } }));
}
/** One commission entry (with its own bill line). Times are UTC; Bangkok = +7. */
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

it("sums the current user's entries earned in the local-day range, with every CommissionReport field", async () => {
  const me = env.base.staff.staff;
  const a = await entry(env.base, me, "2026-09-30T17:00:00.000Z", 1000, 10000); // 2026-10-01 00:00 Bangkok
  const b = await entry(env.base, me, "2026-10-31T16:59:59.000Z", 2500, 20000); // 2026-10-31 23:59:59 Bangkok
  await entry(env.base, me, "2026-09-30T16:59:59.000Z", 9999, 9999); // 2026-09-30 Bangkok
  await entry(env.base, me, "2026-10-31T17:00:00.000Z", 9999, 9999); // 2026-11-01 Bangkok
  await entry(env.base, env.base.staff.front_desk, "2026-10-10T03:00:00.000Z", 7777, 7777); // someone else
  const response = await get(october);
  expect(response.status).toBe(200);
  const body = StaffMeCommissionsResponse.parse(await response.json());
  expect({ ...body, rows: asIds(body.rows) }).toEqual({
    from: "2026-10-01",
    to: "2026-10-31",
    rows: [{ staffUserId: me, staffName: "staff", jobs: 2, baseSatang: 30000, amountSatang: 3500, entries: [a, b] }],
  });
});

it("counts reversals in the period they happen (Q-0030): earned +, reversed −", async () => {
  const me = env.base.staff.staff;
  const kept = await entry(env.base, me, "2026-10-05T03:00:00.000Z", 1000, 10000);
  const sameMonth = await entry(env.base, me, "2026-10-06T03:00:00.000Z", 2000, 20000, "2026-10-07T03:00:00.000Z");
  const lateVoid = await entry(env.base, me, "2026-09-20T03:00:00.000Z", 3000, 30000, "2026-10-08T03:00:00.000Z");
  const october = StaffMeCommissionsResponse.parse(await (await get("?from=2026-10-01&to=2026-10-31")).json());
  expect(asIds(october.rows)).toEqual([
    {
      staffUserId: me,
      staffName: "staff",
      jobs: 0,
      baseSatang: -20000,
      amountSatang: -2000,
      entries: [lateVoid, kept, sameMonth, sameMonth],
    },
  ]);
  const september = StaffMeCommissionsResponse.parse(await (await get("?from=2026-09-01&to=2026-09-30")).json());
  expect(asIds(september.rows)[0]).toMatchObject({ jobs: 1, baseSatang: 30000, amountSatang: 3000, entries: [lateVoid] });
});

it("returns no rows when the user has nothing in range, for every role", async () => {
  for (const role of ["owner", "front_desk", "staff"] as const) {
    const body = StaffMeCommissionsResponse.parse(await (await get(october, role)).json());
    expect(body).toEqual({ from: "2026-10-01", to: "2026-10-31", rows: [] });
  }
});

it("uses the branch timezone for the day bounds", async () => {
  await env.db.update(branch).set({ timezone: "America/New_York" }).where(eq(branch.id, env.base.branchId));
  const id = await entry(env.base, env.base.staff.staff, "2026-10-01T03:00:00.000Z", 1000, 10000); // 2026-09-30 23:00 New York
  const ctx = staffCtx(env.base, "staff");
  expect((await staffMeCommissions(ctx, { from: "2026-10-01", to: "2026-10-01" })).rows).toEqual([]);
  expect((await staffMeCommissions(ctx, { from: "2026-09-30", to: "2026-09-30" })).rows[0]?.entries.map((e) => e.id)).toEqual([id]);
  await env.db.update(branch).set({ timezone: "Asia/Bangkok" }).where(eq(branch.id, env.base.branchId));
});

it("rejects missing, malformed, inverted and over-93-day ranges", async () => {
  for (const query of [
    "",
    "?from=2026-10-01",
    "?to=2026-10-31",
    "?from=01-10-2026&to=2026-10-31",
    "?from=2026-02-30&to=2026-03-01",
    "?from=2026-10-02&to=2026-10-01",
    "?from=2026-01-01&to=2026-04-04",
  ]) {
    const response = await get(query);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await get("?from=2026-01-01&to=2026-04-03")).status).toBe(200); // 93 days inclusive
});

it("denies absent sessions and customer actors", async () => {
  expect((await GET(new Request(`https://petbooking.test/api/v1/staff/me/commissions${october}`))).status).toBe(401);
  await expect(staffMeCommissions(customerCtx(env.base), { from: "2026-10-01", to: "2026-10-31" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's branch and never includes its entries", async () => {
  const foreign = await otherOrg(env.db);
  await entry(foreign, foreign.staff.staff, "2026-10-05T03:00:00.000Z", 1000, 10000);
  for (const branchId of [foreign.branchId, null]) {
    await expect(
      staffMeCommissions({ ...staffCtx(env.base, "staff"), branchId }, { from: "2026-10-01", to: "2026-10-31" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  // a session whose actor id belongs to another org still sees only this org's rows
  const spoofed = { ...staffCtx(env.base, "staff"), actor: { ...staffCtx(env.base, "staff").actor, id: foreign.staff.staff } };
  expect((await staffMeCommissions(spoofed, { from: "2026-10-01", to: "2026-10-31" })).rows).toEqual([]);
});
