import { AvailabilityHotelRequest, AvailabilityHotelResponse } from "@app/contracts/endpoints/availability.hotel";
import {
  booking,
  branchClosure,
  branchPolicy,
  pet,
  petTemperamentFlag,
  ratePlan,
  roomRate,
  roomType,
  roomUnit,
  sizeTier,
  stay,
} from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { availabilityHotel } from "../../../src/services/availability/hotel.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("availability.hotel", { query: AvailabilityHotelRequest }, availabilityHotel);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};
const stayRange = { checkInDate: "2026-10-10", checkOutDate: "2026-10-12" };

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [plan, ota] = await env.db
    .insert(ratePlan)
    .values([
      { ...tenant, name: "ราคาปกติ" },
      { ...tenant, code: "ota", name: "OTA", isDefault: false },
    ])
    .returning();
  const [tierS] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 })
    .returning();
  ids.tierS = tierS?.id ?? "";
  const [small, large] = await env.db
    .insert(roomType)
    .values([
      { ...tenant, nameTh: "ห้องเล็ก", sortOrder: 1, maxWeightGrams: 5_000, speciesAllowed: ["dog"] },
      { ...tenant, nameTh: "ห้องใหญ่", sortOrder: 2, allowReactive: true },
      { ...tenant, nameTh: "ห้องเก่า", sortOrder: 0, status: "archived" },
    ])
    .returning();
  ids.small = small?.id ?? "";
  ids.large = large?.id ?? "";
  const units = await env.db
    .insert(roomUnit)
    .values([
      { ...tenant, roomTypeId: ids.small, code: "S1" },
      { ...tenant, roomTypeId: ids.small, code: "S2" },
      { ...tenant, roomTypeId: ids.small, code: "S3", status: "maintenance" },
      { ...tenant, roomTypeId: ids.large, code: "L1" },
    ])
    .returning();
  await env.db.insert(roomRate).values([
    { organizationId: org.orgId, roomTypeId: ids.small, ratePlanId: plan?.id ?? "", sizeTierId: ids.tierS, nightlyPriceSatang: 50_000 },
    { organizationId: org.orgId, roomTypeId: ids.small, ratePlanId: plan?.id ?? "", sizeTierId: null, nightlyPriceSatang: 60_000 },
    { organizationId: org.orgId, roomTypeId: ids.small, ratePlanId: ota?.id ?? "", sizeTierId: null, nightlyPriceSatang: 99_000 },
  ]);
  await env.db.insert(branchPolicy).values({ branchId: org.branchId, rejectedBreeds: ["Pitbull"] });
  const [mochi, kuma] = await env.db
    .insert(pet)
    .values([
      { ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog", latestWeightGrams: 4_000 },
      { ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Kuma", species: "cat", latestWeightGrams: 6_000 },
    ])
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.kuma = kuma?.id ?? "";
  await env.db.insert(petTemperamentFlag).values({ organizationId: org.orgId, petId: ids.kuma, flag: "bites" });
  const [foreignPet] = await env.db
    .insert(pet)
    .values({ ownerProfileId: foreign.ownerProfileId, createdInOrgId: foreign.orgId, name: "Other", species: "dog" })
    .returning();
  ids.foreignPet = foreignPet?.id ?? "";

  // S1 reserved on the night of 10-11 only; a cancelled stay on S2 does not count
  const stayOn = async (unitIdx: number, checkInDate: string, checkOutDate: string, status: "reserved" | "cancelled", petId: string) => {
    const [b] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `H-${unitIdx}-${status}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
      })
      .returning();
    await env.db.insert(stay).values({
      ...tenant,
      bookingId: b?.id ?? "",
      petId,
      roomTypeId: ids.small ?? "",
      roomUnitId: units[unitIdx]?.id ?? "",
      checkInDate,
      checkOutDate,
      nights: (Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86_400_000,
      nightlyPriceSatang: 0,
      roomTotalSatang: 0,
      status,
    });
  };
  await stayOn(0, "2026-10-11", "2026-10-12", "reserved", ids.mochi);
  await stayOn(1, "2026-10-10", "2026-10-12", "cancelled", ids.kuma);
});
afterAll(async () => {
  await env.close();
});

async function get(qs: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/availability/hotel${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}
const hotel = (input: Record<string, unknown>) => availabilityHotel(staffCtx(env.base, "owner"), AvailabilityHotelRequest.parse(input));

it.each(["owner", "front_desk"] as const)("returns R-28 per active room type with the pet's price and R-12 for %s", async (role) => {
  const response = await get(`?checkInDate=2026-10-10&checkOutDate=2026-10-12&petId=${ids.mochi}`, role);
  expect(response.status).toBe(200);
  expect(AvailabilityHotelResponse.parse(await response.json())).toEqual({
    nights: 2,
    roomTypes: [
      // S1 is taken on 10-11 → only S2 free for both nights; Mochi (4 kg) → tier S price
      { roomTypeId: ids.small, nameTh: "ห้องเล็ก", availableUnits: 1, nightlyPriceSatang: 50_000, eligible: true, ineligibleReasons: [] },
      { roomTypeId: ids.large, nameTh: "ห้องใหญ่", availableUnits: 1, nightlyPriceSatang: null, eligible: true, ineligibleReasons: [] },
    ],
  });
});

it("without petId uses the all-size price and skips R-12", async () => {
  const result = await hotel(stayRange);
  expect(result.roomTypes[0]).toMatchObject({ nightlyPriceSatang: 60_000, eligible: true, ineligibleReasons: [] });
});

it("reports R-12 reasons for a pet that does not fit the room type", async () => {
  const result = await hotel({ ...stayRange, petId: ids.kuma });
  // cat, 6 kg, bites: small room is dog-only, ≤ 5 kg and not for reactive pets; large room accepts reactive pets
  expect(result.roomTypes.map((t) => [t.eligible, t.ineligibleReasons])).toEqual([
    [false, ["SPECIES_NOT_ALLOWED", "PET_TOO_HEAVY", "REACTIVE_NOT_ALLOWED"]],
    [true, []],
  ]);
  // no tier for cats → all-size price
  expect(result.roomTypes[0]?.nightlyPriceSatang).toBe(60_000);
});

it("closes every room type when a hotel closure touches a night of the stay", async () => {
  const [c] = await env.db
    .insert(branchClosure)
    .values({
      branchId: env.base.branchId,
      startsAt: new Date("2026-10-11T05:00:00.000Z"),
      endsAt: new Date("2026-10-11T06:00:00.000Z"),
      scope: "hotel",
      source: "manual",
    })
    .returning();
  expect((await hotel(stayRange)).roomTypes.map((t) => t.availableUnits)).toEqual([0, 0]);
  // grooming-only closures do not close the hotel
  const { eq } = await import("drizzle-orm");
  await env.db
    .update(branchClosure)
    .set({ scope: "grooming" })
    .where(eq(branchClosure.id, c?.id ?? ""));
  expect((await hotel(stayRange)).roomTypes.map((t) => t.availableUnits)).toEqual([1, 1]);
  await env.db.delete(branchClosure);
});

it("rejects missing and malformed dates with VALIDATION_FAILED", async () => {
  for (const qs of [
    "",
    "?checkInDate=2026-10-10",
    "?checkInDate=2026-10-10&checkOutDate=2026-10-10",
    "?checkInDate=2026-10-12&checkOutDate=2026-10-10",
    "?checkInDate=2026-10-01&checkOutDate=2026-11-01",
    "?checkInDate=2026-02-30&checkOutDate=2026-03-02",
    "?checkInDate=2026-10-10&checkOutDate=2026-10-12&petId=x",
  ]) {
    const response = await get(qs);
    expect(response.status, qs).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await get("?checkInDate=2026-10-01&checkOutDate=2026-10-31")).status).toBe(200);
});

it("denies role staff and customer actors", async () => {
  const response = await get("?checkInDate=2026-10-10&checkOutDate=2026-10-12", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(availabilityHotel(customerCtx(env.base), AvailabilityHotelRequest.parse(stayRange))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's branch or pet", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(
      availabilityHotel({ ...staffCtx(env.base, "owner"), branchId }, AvailabilityHotelRequest.parse(stayRange)),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  const response = await get(`?checkInDate=2026-10-10&checkOutDate=2026-10-12&petId=${ids.foreignPet}`);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
