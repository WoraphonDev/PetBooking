import { AvailabilityDaycareRequest, AvailabilityDaycareResponse } from "@app/contracts/endpoints/availability.daycare";
import { booking, branchClosure, daycareRate, daycareSessionType, daycareVisit, pet, ratePlan, sizeTier } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { availabilityDaycare } from "../../../src/services/availability/daycare.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("availability.daycare", { query: AvailabilityDaycareRequest }, availabilityDaycare);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ราคาปกติ" })
    .returning();
  const [tierS] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 })
    .returning();
  const [afternoon, full, morning] = await env.db
    .insert(daycareSessionType)
    .values([
      { ...tenant, session: "afternoon", nameTh: "บ่าย", startsAt: "13:00", endsAt: "18:00", capacity: 5, status: "archived" },
      { ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 },
      { ...tenant, session: "morning", nameTh: "เช้า", startsAt: "08:00", endsAt: "12:00", capacity: 4 },
    ])
    .returning();
  ids.afternoon = afternoon?.id ?? "";
  ids.full = full?.id ?? "";
  ids.morning = morning?.id ?? "";
  await env.db.insert(daycareRate).values([
    { organizationId: org.orgId, sessionTypeId: ids.full, ratePlanId: plan?.id ?? "", sizeTierId: tierS?.id ?? "", priceSatang: 40_000 },
    { organizationId: org.orgId, sessionTypeId: ids.full, ratePlanId: plan?.id ?? "", sizeTierId: null, priceSatang: 50_000 },
  ]);
  const pets = await env.db
    .insert(pet)
    .values(
      ["Mochi", "Kuma", "Tama"].map((name) => ({
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name,
        species: "dog" as const,
        latestWeightGrams: 3_000,
      })),
    )
    .returning();
  ids.mochi = pets[0]?.id ?? "";
  const [foreignPet] = await env.db
    .insert(pet)
    .values({ ownerProfileId: foreign.ownerProfileId, createdInOrgId: foreign.orgId, name: "Other", species: "dog" })
    .returning();
  ids.foreignPet = foreignPet?.id ?? "";
  const [b] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: "D-1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  // 10-10: one full day + one morning (+ a cancelled morning that does not count)
  await env.db.insert(daycareVisit).values([
    { ...tenant, bookingId: b?.id ?? "", petId: pets[0]?.id ?? "", sessionTypeId: ids.full, visitDate: "2026-10-10", priceSatang: 0 },
    { ...tenant, bookingId: b?.id ?? "", petId: pets[1]?.id ?? "", sessionTypeId: ids.morning, visitDate: "2026-10-10", priceSatang: 0 },
    {
      ...tenant,
      bookingId: b?.id ?? "",
      petId: pets[2]?.id ?? "",
      sessionTypeId: ids.morning,
      visitDate: "2026-10-10",
      priceSatang: 0,
      status: "cancelled",
    },
  ]);
});
afterAll(async () => {
  await env.close();
});
beforeEach(async () => {
  await env.db.delete(branchClosure);
});

async function get(qs: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/availability/daycare${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}
const daycare = (input: Record<string, unknown>) =>
  availabilityDaycare(staffCtx(env.base, "owner"), AvailabilityDaycareRequest.parse(input));

it.each(["owner", "front_desk"] as const)("returns R-29 places of active sessions with the pet's price for %s", async (role) => {
  const response = await get(`?date=2026-10-10&petId=${ids.mochi}`, role);
  expect(response.status).toBe(200);
  expect(AvailabilityDaycareResponse.parse(await response.json())).toEqual({
    date: "2026-10-10",
    sessions: [
      // full day: min(10 − 1, morning 4 − (1 + 1) = 2) = 2
      { sessionTypeId: ids.full, session: "full_day", nameTh: "เต็มวัน", available: 2, priceSatang: 40_000 },
      { sessionTypeId: ids.morning, session: "morning", nameTh: "เช้า", available: 2, priceSatang: null },
    ],
  });
});

it("without petId uses the all-size price; an empty day is fully free", async () => {
  expect(await daycare({ date: "2026-10-11" })).toEqual({
    date: "2026-10-11",
    sessions: [
      { sessionTypeId: ids.full, session: "full_day", nameTh: "เต็มวัน", available: 4, priceSatang: 50_000 },
      { sessionTypeId: ids.morning, session: "morning", nameTh: "เช้า", available: 4, priceSatang: null },
    ],
  });
});

it("offers nothing on a day closed for daycare", async () => {
  await env.db.insert(branchClosure).values({
    branchId: env.base.branchId,
    startsAt: new Date("2026-10-11T02:00:00.000Z"),
    endsAt: new Date("2026-10-11T03:00:00.000Z"),
    scope: "daycare",
    source: "manual",
  });
  expect((await daycare({ date: "2026-10-11" })).sessions.map((s) => s.available)).toEqual([0, 0]);
  expect((await daycare({ date: "2026-10-12" })).sessions.map((s) => s.available)).toEqual([4, 4]);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const qs of ["", "?date=2026-10-1", "?date=2026-02-30", "?date=2026-10-10&petId=x"]) {
    const response = await get(qs);
    expect(response.status, qs).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("denies role staff and customer actors", async () => {
  const response = await get("?date=2026-10-10", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(availabilityDaycare(customerCtx(env.base), { date: "2026-10-10" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch or pet", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(availabilityDaycare({ ...staffCtx(env.base, "owner"), branchId }, { date: "2026-10-10" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  const response = await get(`?date=2026-10-10&petId=${ids.foreignPet}`);
  expect(response.status).toBe(404);
});
