import { AdminHolidaysParams, AdminHolidaysRequest, AdminHolidaysResponse } from "@app/contracts/endpoints/admin.holidays";
import { branchClosure, platformAdmin, publicHoliday } from "@app/db/schema";
import { asc } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits } from "../../../src/http.ts";
import { withAdmin } from "../../../src/http/wrap.ts";
import { adminHolidays } from "../../../src/services/admin/holidays.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const PUT = withAdmin("admin.holidays", { params: AdminHolidaysParams, body: AdminHolidaysRequest }, adminHolidays);
beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
async function put(year: string, body: unknown, cookie?: string) {
  let c = cookie;
  if (!c) {
    const [admin] = await env.db
      .insert(platformAdmin)
      .values({ email: `a${Math.random()}@example.test`, displayName: "Admin", passwordHash: "unused" })
      .returning();
    c = `aid=${(await createSession(env.db, { subjectType: "platform_admin", subjectId: admin?.id ?? "" }, new Date())).token}`;
  }
  return PUT(
    new Request(`https://petbooking.test/api/v1/admin/public-holidays/${year}`, {
      method: "PUT",
      headers: { cookie: c, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ year }) },
  );
}
const holidays = () => env.db.select().from(publicHoliday).orderBy(asc(publicHoliday.holidayDate));

it("replaces exactly that year's holidays and returns empty 204", async () => {
  await env.db.delete(publicHoliday);
  await env.db.insert(publicHoliday).values([
    { holidayDate: "2026-01-01", nameTh: "old" },
    { holidayDate: "2026-12-31", nameTh: "old end" },
    { holidayDate: "2025-12-31", nameTh: "previous year" },
    { holidayDate: "2027-01-01", nameTh: "next year" },
  ]);
  const response = await put("2026", {
    days: [
      { date: "2026-04-06", nameTh: "วันจักรี" },
      { date: "2026-01-01", nameTh: " วันขึ้นปีใหม่ " },
    ],
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(AdminHolidaysResponse.safeParse(undefined).success).toBe(true);
  expect((await holidays()).map((h) => [h.holidayDate, h.nameTh])).toEqual([
    ["2025-12-31", "previous year"],
    ["2026-01-01", "วันขึ้นปีใหม่"],
    ["2026-04-06", "วันจักรี"],
    ["2027-01-01", "next year"],
  ]);
});

it("clears a year with an empty list, stamps ctx.now and leaves branch closures alone", async () => {
  await env.db.delete(publicHoliday);
  await env.db.insert(branchClosure).values({
    branchId: env.base.branchId,
    startsAt: new Date("2025-12-31T17:00:00.000Z"),
    endsAt: new Date("2026-01-01T17:00:00.000Z"),
    source: "public_holiday",
  });
  await adminHolidays(makeSystemCtx(null, TEST_NOW), { year: 2026, days: [{ date: "2026-05-01", nameTh: "วันแรงงาน" }] });
  expect((await holidays())[0]).toMatchObject({ holidayDate: "2026-05-01", createdAt: TEST_NOW });
  await adminHolidays(makeSystemCtx(null, TEST_NOW), { year: 2026, days: [] });
  expect(await holidays()).toEqual([]);
  expect(await env.db.select().from(branchClosure)).toHaveLength(1);
});

it("rejects malformed years and days, dates outside the year and duplicates without writing", async () => {
  await env.db.delete(publicHoliday);
  const ok = { days: [{ date: "2026-01-01", nameTh: "ปีใหม่" }] };
  for (const [year, body] of [
    ["abc", ok],
    ["2026.5", ok],
    ["26", ok],
    ["2026", {}],
    ["2026", { days: [{ date: "2026-01-01" }] }],
    ["2026", { days: [{ date: "2026-01-01", nameTh: "  " }] }],
    ["2026", { days: [{ date: "01-01-2026", nameTh: "x" }] }],
    ["2026", { days: [{ date: "2026-02-30", nameTh: "x" }] }],
    ["2026", { days: [{ date: "2027-01-01", nameTh: "x" }] }],
    ["2026", { days: [ok.days[0], ok.days[0]] }],
  ] as const) {
    const response = await put(year, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await holidays()).toEqual([]);
});

it("requires a platform admin session", async () => {
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  expect((await put("2026", { days: [] }, `aid=${staff.token}`)).status).toBe(401);
  expect((await put("2026", { days: [] }, "aid=nope")).status).toBe(401);
});
