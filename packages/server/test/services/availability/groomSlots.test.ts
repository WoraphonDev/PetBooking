import { AvailabilityGroomSlotsRequest, AvailabilityGroomSlotsResponse } from "@app/contracts/endpoints/availability.groomSlots";
import {
  booking,
  branch,
  branchClosure,
  branchHours,
  branchPolicy,
  groomAppointment,
  groomStation,
  pet,
  ratePlan,
  service,
  servicePrice,
  sizeTier,
  staffUser,
  staffWorkingHours,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { availabilityGroomSlots } from "../../../src/services/availability/groomSlots.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

// Saturday 2026-10-10 (weekday 6), Asia/Bangkok: 09:00 = 02:00Z … 12:00 = 05:00Z
const POST = withStaff("availability.groomSlots", { body: AvailabilityGroomSlotsRequest }, availabilityGroomSlots);
const DATE = "2026-10-10";
const at = (hhmm: string) => `2026-10-10T${String(Number(hhmm.slice(0, 2)) - 7).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  await env.db.insert(branchHours).values({ branchId: org.branchId, weekday: 6, isClosed: false, opensAt: "09:00", closesAt: "12:00" });
  await env.db.insert(branchPolicy).values({ branchId: org.branchId, slotStepMinutes: 30, bufferMinutes: 0 });
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "T1" })
    .returning();
  ids.station = st?.id ?? "";
  await env.db.update(staffUser).set({ isGroomer: true, sortOrder: 1 }).where(eq(staffUser.id, org.staff.staff));
  await env.db.update(staffUser).set({ isGroomer: true, sortOrder: 2 }).where(eq(staffUser.id, org.staff.owner));
  await env.db
    .insert(staffWorkingHours)
    .values(
      [org.staff.staff, org.staff.owner].map((staffUserId) => ({ ...tenant, staffUserId, weekday: 6, startsAt: "09:00", endsAt: "12:00" })),
    );
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ราคาปกติ" })
    .returning();
  const [tierS] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 })
    .returning();
  ids.tierS = tierS?.id ?? "";
  const [bath, nail, noPrice, hotelAddon] = await env.db
    .insert(service)
    .values([
      { ...tenant, category: "bath", nameTh: "อาบน้ำ" },
      { ...tenant, category: "nail", nameTh: "ตัดเล็บ", isAddon: true },
      { ...tenant, category: "bath", nameTh: "สปา" },
      { ...tenant, category: "hotel_addon", nameTh: "อาบก่อนกลับ", scope: "hotel", isAddon: true },
    ])
    .returning();
  ids.bath = bath?.id ?? "";
  ids.nail = nail?.id ?? "";
  ids.noPrice = noPrice?.id ?? "";
  ids.hotelAddon = hotelAddon?.id ?? "";
  await env.db.insert(servicePrice).values([
    {
      organizationId: org.orgId,
      serviceId: ids.bath,
      ratePlanId: plan?.id ?? "",
      sizeTierId: ids.tierS,
      coatGroup: "any",
      priceSatang: 30_000,
      durationMinutes: 45,
    },
    {
      organizationId: org.orgId,
      serviceId: ids.bath,
      ratePlanId: plan?.id ?? "",
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 40_000,
      durationMinutes: 60,
    },
    {
      organizationId: org.orgId,
      serviceId: ids.nail,
      ratePlanId: plan?.id ?? "",
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 5_000,
      durationMinutes: 15,
    },
  ]);
  const [mochi, unknownWeight] = await env.db
    .insert(pet)
    .values([
      { ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog", latestWeightGrams: 4_000 },
      { ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Kuma", species: "dog" },
    ])
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.unknownWeight = unknownWeight?.id ?? "";
  const [foreignPet] = await env.db
    .insert(pet)
    .values({
      ownerProfileId: foreign.ownerProfileId,
      createdInOrgId: foreign.orgId,
      name: "Other",
      species: "dog",
      latestWeightGrams: 3_000,
    })
    .returning();
  ids.foreignPet = foreignPet?.id ?? "";
  // staff groomer is booked 10:00–11:00 on T1; a cancelled one at 09:00 does not count
  const [b] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: "G-1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  const [busy] = await env.db
    .insert(groomAppointment)
    .values([
      {
        ...tenant,
        bookingId: b?.id ?? "",
        petId: ids.mochi,
        groomerId: org.staff.staff,
        stationId: ids.station,
        startsAt: new Date(at("10:00")),
        endsAt: new Date(at("11:00")),
        blockedUntil: new Date(at("11:00")),
      },
      {
        ...tenant,
        bookingId: b?.id ?? "",
        petId: ids.mochi,
        groomerId: org.staff.owner,
        stationId: ids.station,
        startsAt: new Date(at("09:00")),
        endsAt: new Date(at("10:00")),
        blockedUntil: new Date(at("10:00")),
        status: "cancelled",
      },
    ])
    .returning();
  ids.busy = busy?.id ?? "";
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db.delete(branchClosure);
});

async function post(body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/availability/groom-slots", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
}
const base = () => ({ date: DATE, petId: ids.mochi, serviceIds: [ids.bath] });
const slots = (body: Record<string, unknown>, org: SeedOrg = env.base) =>
  availabilityGroomSlots(staffCtx(org, "owner"), AvailabilityGroomSlotsRequest.parse(body));
const starts = (r: { slots: { startsAt: string; groomerId: string }[] }) => r.slots.map((s) => [s.startsAt, s.groomerId]);

it.each(["owner", "front_desk"] as const)("returns R-04 slots with R-02/R-03 price and duration for %s", async (role) => {
  const response = await post({ ...base(), addonIds: [ids.nail] }, role);
  expect(response.status).toBe(200);
  // tier S bath 45 min + nail 15 min = 60 min, 30-min steps; the station is taken 10:00–11:00 (blocks 09:30–10:30 starts)
  expect(AvailabilityGroomSlotsResponse.parse(await response.json())).toEqual({
    date: DATE,
    reason: "ok",
    durationMinutes: 60,
    priceSatang: 35_000,
    slots: [
      // the owner groomer has no load yet, so it is picked before the busier staff groomer
      { startsAt: at("09:00"), endsAt: at("10:00"), groomerId: env.base.staff.owner, groomerName: "owner", stationId: ids.station },
      { startsAt: at("11:00"), endsAt: at("12:00"), groomerId: env.base.staff.owner, groomerName: "owner", stationId: ids.station },
    ],
  });
});

it("honours groomerId, excludeAppointmentId and pendingAppointments", async () => {
  expect(starts(await slots({ ...base(), groomerId: env.base.staff.staff }))).toEqual([
    [at("09:00"), env.base.staff.staff],
    [at("11:00"), env.base.staff.staff],
  ]);
  expect((await slots({ ...base(), excludeAppointmentId: ids.busy })).slots.map((s) => s.startsAt)).toEqual([
    at("09:00"),
    at("09:30"),
    at("10:00"),
    at("10:30"),
    at("11:00"),
  ]);
  const pending = { groomerId: env.base.staff.owner, stationId: ids.station, startsAt: at("09:00"), blockedUntil: at("10:00") };
  expect((await slots({ ...base(), pendingAppointments: [pending] })).slots.map((s) => s.startsAt)).toEqual([at("11:00")]);
});

it("uses the all-size price without a tier, the sizeTierId override when the weight is unknown, and skips closures", async () => {
  const override = await slots({ ...base(), petId: ids.unknownWeight, sizeTierId: ids.tierS });
  expect([override.priceSatang, override.durationMinutes]).toEqual([30_000, 45]);
  await env.db.insert(branchClosure).values({
    branchId: env.base.branchId,
    startsAt: new Date(at("09:00")),
    endsAt: new Date(at("10:00")),
    scope: "grooming",
    source: "manual",
  });
  expect((await slots(base())).slots.map((s) => s.startsAt)).toEqual([at("11:00")]);
});

it("reports closed on a day without opening hours", async () => {
  expect(await slots({ ...base(), date: "2026-10-11" })).toMatchObject({ date: "2026-10-11", reason: "closed", slots: [] });
});

it("returns WEIGHT_REQUIRED for a pet without weight and no size chosen", async () => {
  const response = await post({ ...base(), petId: ids.unknownWeight });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "WEIGHT_REQUIRED" } });
});

it("returns PRICE_NOT_FOUND when a service has no price for the pet", async () => {
  const response = await post({ ...base(), serviceIds: [ids.noPrice] });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "PRICE_NOT_FOUND" } });
});

it("returns MODULE_DISABLED when grooming is off for the branch", async () => {
  await env.db.update(branch).set({ moduleGrooming: false }).where(eq(branch.id, env.base.branchId));
  try {
    const response = await post(base());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "MODULE_DISABLED" } });
  } finally {
    await env.db.update(branch).set({ moduleGrooming: true }).where(eq(branch.id, env.base.branchId));
  }
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const body of [
    {},
    { ...base(), serviceIds: [] },
    { ...base(), date: "2026-10-32" },
    { ...base(), petId: "x" },
    { ...base(), pendingAppointments: [{ groomerId: ids.station }] },
    // an add-on as the main service, a main service as an add-on, a hotel add-on
    { ...base(), serviceIds: [ids.nail] },
    { ...base(), addonIds: [ids.bath] },
    { ...base(), addonIds: [ids.hotelAddon] },
  ]) {
    const response = await post(body);
    expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("denies role staff and customer actors", async () => {
  const response = await post(base(), "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(availabilityGroomSlots(customerCtx(env.base), AvailabilityGroomSlotsRequest.parse(base()))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's branch, pet, service, size tier or groomer", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(
      availabilityGroomSlots({ ...staffCtx(env.base, "owner"), branchId }, AvailabilityGroomSlotsRequest.parse(base())),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  for (const body of [
    { ...base(), petId: ids.foreignPet },
    { ...base(), serviceIds: ["00000000-0000-4000-8000-000000000000"] },
    { ...base(), sizeTierId: "00000000-0000-4000-8000-000000000000" },
    { ...base(), groomerId: foreign.staff.owner },
  ]) {
    const response = await post(body);
    expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  }
});
