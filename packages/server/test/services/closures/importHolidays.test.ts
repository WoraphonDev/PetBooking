import { ClosuresImportHolidaysRequest, ClosuresImportHolidaysResponse } from "@app/contracts/endpoints/closures.importHolidays";
import { branch, branchClosure, publicHoliday } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { closuresImportHolidays } from "../../../src/services/closures/importHolidays.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const body = { year: 2026, dates: ["2026-01-01", "2026-04-06"], scope: "all" } as const;
const POST = withStaff("closures.importHolidays", { body: ClosuresImportHolidaysRequest }, closuresImportHolidays);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  await env.db
    .insert(publicHoliday)
    .values([
      { holidayDate: "2026-01-01", nameTh: "New Year" },
      { holidayDate: "2026-04-06", nameTh: "Chakri" },
      { holidayDate: "2026-05-04", nameTh: "Coronation" },
      { holidayDate: "2027-01-01", nameTh: "Next year" },
    ])
    .onConflictDoNothing();
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(branchClosure);
  resetRateLimits();
});
async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/branch/closures/public-holidays", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}

it("imports exactly the selected holidays as whole local days and returns empty 204", async () => {
  const response = await post(body);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(ClosuresImportHolidaysResponse.safeParse(undefined).success).toBe(true);
  const rows = await env.db.select().from(branchClosure).orderBy(branchClosure.startsAt);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => [r.branchId, r.scope, r.source, r.startsAt.toISOString(), r.endsAt.toISOString(), r.createdBy])).toEqual([
    [env.base.branchId, "all", "public_holiday", "2025-12-31T17:00:00.000Z", "2026-01-01T17:00:00.000Z", env.base.staff.owner],
    [env.base.branchId, "all", "public_holiday", "2026-04-05T17:00:00.000Z", "2026-04-06T17:00:00.000Z", env.base.staff.owner],
  ]);
});

it("uses the scoped branch timezone, scope and ctx.now", async () => {
  await env.db.update(branch).set({ timezone: "America/New_York" }).where(eq(branch.id, env.base.branchId));
  const ctx = staffCtx(env.base, "owner");
  await closuresImportHolidays(ctx, { year: 2026, dates: ["2026-01-01"], scope: "grooming" });
  const [row] = await env.db.select().from(branchClosure);
  expect(row).toMatchObject({ scope: "grooming", source: "public_holiday", createdAt: TEST_NOW, updatedAt: TEST_NOW });
  expect(row?.startsAt.toISOString()).toBe("2026-01-01T05:00:00.000Z");
  expect(row?.endsAt.toISOString()).toBe("2026-01-02T05:00:00.000Z");
  await env.db.update(branch).set({ timezone: "Asia/Bangkok" }).where(eq(branch.id, env.base.branchId));
});

it("rejects missing and malformed required fields before writing", async () => {
  for (const invalid of [
    {},
    { ...body, year: 2026.5 },
    { ...body, dates: ["01-01-2026"] },
    { ...body, dates: ["2026-02-30"] },
    { ...body, scope: "invalid" },
  ]) {
    const response = await post(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});
it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await post(body, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});
it("denies absent sessions and customer actors", async () => {
  const response = await POST(new Request("https://petbooking.test/api/v1/staff/branch/closures/public-holidays", { method: "POST" }));
  expect(response.status).toBe(401);
  await expect(closuresImportHolidays(customerCtx(env.base), { ...body, dates: [...body.dates] })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("returns NOT_FOUND for another organization's branch and an absent branch", async () => {
  const foreign = await otherOrg(env.db);
  for (const branchId of [foreign.branchId, null]) {
    await expect(
      closuresImportHolidays({ ...staffCtx(env.base, "owner"), branchId }, { ...body, dates: [...body.dates] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});
