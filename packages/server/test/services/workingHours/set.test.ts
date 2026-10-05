import { WorkingHoursSetParams, WorkingHoursSetRequest, WorkingHoursSetResponse } from "@app/contracts/endpoints/workingHours.set";
import { booking, branch, groomAppointment, groomStation, pet, staffUser, staffWorkingHours } from "@app/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { workingHoursSet } from "../../../src/services/workingHours/set.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

// TEST_NOW = 2026-10-05T03:00Z (Mon 10:00 Bangkok). 2026-10-06 is a Tuesday (weekday 2), 2026-10-07 a Wednesday.
const PUT = withStaff("workingHours.set", { body: WorkingHoursSetRequest, params: WorkingHoursSetParams }, workingHoursSet);
let env: TestEnv;
let foreign: SeedOrg;
let groomer: string;
let foreignGroomer: string;
const appts: Record<string, string> = {};

async function addGroomer(org: SeedOrg, tag: string) {
  const [g] = await env.db
    .insert(staffUser)
    .values({ organizationId: org.orgId, email: `g@${tag}.test`, displayName: "Dao", role: "staff", status: "active", isGroomer: true })
    .returning();
  return g?.id ?? "";
}

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  groomer = await addGroomer(env.base, "a");
  foreignGroomer = await addGroomer(foreign, "b");
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  // an existing week to be replaced, plus a row at another branch that must stay
  const [otherBranch] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: "second-a" })
    .returning();
  await env.db.insert(staffWorkingHours).values([
    { ...tenant, staffUserId: groomer, weekday: 1, startsAt: "08:00", endsAt: "17:00" },
    { ...tenant, staffUserId: groomer, weekday: 5, startsAt: "08:00", endsAt: "17:00" },
    {
      organizationId: env.base.orgId,
      branchId: otherBranch?.id ?? "",
      staffUserId: groomer,
      weekday: 1,
      startsAt: "10:00",
      endsAt: "12:00",
    },
  ]);
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "T1" })
    .returning();
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "Mochi", species: "dog" })
    .returning();
  const [b] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: env.base.customerId,
      bookingNo: "B-1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  const list: [string, string, number, typeof groomAppointment.$inferInsert.status][] = [
    ["inside", "2026-10-06T03:00:00Z", 60, "scheduled"], // Tue 10:00–11:00
    ["early", "2026-10-06T01:30:00Z", 60, "scheduled"], // Tue 08:30 — before 09:00
    ["onBreak", "2026-10-06T05:30:00Z", 60, "scheduled"], // Tue 12:30 — overlaps 12:00–13:00
    ["dayOff", "2026-10-07T03:00:00Z", 60, "scheduled"], // Wednesday — not sent
    ["cancelled", "2026-10-07T05:00:00Z", 60, "cancelled"],
    ["past", "2026-10-05T01:00:00Z", 60, "done"], // already finished
  ];
  for (const [key, startsAt, minutes, status] of list) {
    const end = new Date(Date.parse(startsAt) + minutes * 60_000);
    const [row] = await env.db
      .insert(groomAppointment)
      .values({
        ...tenant,
        bookingId: b?.id ?? "",
        petId: mochi?.id ?? "",
        groomerId: groomer,
        stationId: station?.id ?? "",
        startsAt: new Date(startsAt),
        endsAt: end,
        blockedUntil: end,
        status,
      })
      .returning();
    appts[key] = row?.id ?? "";
  }
}, 60_000);
afterAll(() => env.close());
beforeEach(() => {
  resetRateLimits();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TEST_NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function put(role: "owner" | "front_desk" | "staff", staffUserId: string, body: unknown) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request(`https://petbooking.test/api/v1/staff/staff-users/${staffUserId}/working-hours`, {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { staffUserId } },
  );
}

const week = {
  days: [
    { weekday: 1, startsAt: "09:00", endsAt: "18:00" },
    { weekday: 2, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "12:00", breakEndsAt: "13:00" },
  ],
};
const rowsOf = (branchId: string) =>
  env.db
    .select()
    .from(staffWorkingHours)
    .where(and(eq(staffWorkingHours.staffUserId, groomer), eq(staffWorkingHours.branchId, branchId)))
    .orderBy(asc(staffWorkingHours.weekday));

it("replaces the whole week at the session branch and warns about future appointments now outside it", async () => {
  const response = await put("front_desk", groomer, week);
  expect(response.status).toBe(200);
  const body = WorkingHoursSetResponse.parse(await response.json());
  expect(body.id).toBe(groomer);
  expect(body.warnings).toEqual([
    {
      code: "WORKING_HOURS_AFFECTED",
      message: "มีนัดของช่างอยู่นอกเวลาทำงานใหม่ 3 นัด",
      data: { appointmentIds: [appts.early, appts.onBreak, appts.dayOff] },
    },
  ]);
  const rows = await rowsOf(env.base.branchId);
  expect(rows.map((r) => [r.weekday, r.startsAt, r.endsAt, r.breakStartsAt, r.breakEndsAt, r.organizationId])).toEqual([
    [1, "09:00:00", "18:00:00", null, null, env.base.orgId],
    [2, "09:00:00", "18:00:00", "12:00:00", "13:00:00", env.base.orgId],
  ]);
  // Friday (not sent) is now a day off; the other branch's row is untouched
  expect(body.workingHours.filter((h) => h.weekday === 1).map((h) => h.startsAt)).toEqual(["09:00", "10:00"]);
});

it("an empty week clears every day without warnings when nothing is booked ahead", async () => {
  const quiet = await addGroomer(env.base, "quiet");
  const result = await workingHoursSet(staffCtx(env.base, "owner"), { staffUserId: quiet, days: [] });
  expect(result.workingHours).toEqual([]);
  expect(result).not.toHaveProperty("warnings");
});

it("rejects malformed days with VALIDATION_FAILED", async () => {
  const bad = [
    {},
    { days: [{ weekday: 7, startsAt: "09:00", endsAt: "18:00" }] },
    { days: [{ weekday: 1, startsAt: "18:00", endsAt: "09:00" }] },
    { days: [{ weekday: 1, startsAt: "9:00", endsAt: "18:00" }] },
    { days: [{ weekday: 1, startsAt: "09:00" }] },
    { days: [week.days[0], week.days[0]] },
    { days: [{ weekday: 1, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "12:00" }] },
    { days: [{ weekday: 1, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "17:30", breakEndsAt: "18:30" }] },
  ];
  for (const body of bad) {
    const response = await put("owner", groomer, body);
    expect(response.status, JSON.stringify(body)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("forbids role staff", async () => {
  const response = await put("staff", groomer, week);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers NOT_FOUND for a staff member of another organization and leaves their hours alone", async () => {
  const response = await put("owner", foreignGroomer, week);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  expect(await env.db.select().from(staffWorkingHours).where(eq(staffWorkingHours.staffUserId, foreignGroomer))).toEqual([]);
  await expect(
    workingHoursSet({ ...staffCtx(env.base, "owner"), branchId: foreign.branchId }, { staffUserId: groomer, ...week }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
