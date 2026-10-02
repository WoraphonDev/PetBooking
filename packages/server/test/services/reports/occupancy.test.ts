import { ReportsOccupancyRequest, ReportsOccupancyResponse } from "@app/contracts/endpoints/reports.occupancy";
import { booking, pet, roomType, roomUnit, stay } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { reportsOccupancy } from "../../../src/services/reports/occupancy.ts";
import { customerCtx, otherOrg, type SeedOrg, seedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("reports.occupancy", { query: ReportsOccupancyRequest }, reportsOccupancy);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};
const week = "?from=2026-10-05&to=2026-10-07";

async function seedHotel(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [small, large, archived] = await env.db
    .insert(roomType)
    .values([
      { ...tenant, nameTh: "ห้องเล็ก", sortOrder: 1 },
      { ...tenant, nameTh: "ห้องใหญ่", sortOrder: 2 },
      { ...tenant, nameTh: "ห้องเก่า", sortOrder: 0, status: "archived" },
    ])
    .returning();
  const unit = async (typeId: string | undefined, code: string, status: "active" | "maintenance" = "active") => {
    const [u] = await env.db
      .insert(roomUnit)
      .values({ ...tenant, roomTypeId: typeId ?? "", code, status })
      .returning();
    return u?.id ?? "";
  };
  const s1 = await unit(small?.id, "S1");
  const s2 = await unit(small?.id, "S2");
  await unit(small?.id, "S3", "maintenance");
  const l1 = await unit(large?.id, "L1");
  const [p1, p2] = await env.db
    .insert(pet)
    .values(
      ["Mochi", "Kuma"].map((name) => ({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name, species: "dog" as const })),
    )
    .returning();
  let n = 0;
  const room = async (
    typeId: string | undefined,
    unitId: string,
    petId: string | undefined,
    checkInDate: string,
    checkOutDate: string,
    status: "reserved" | "checked_in" | "checked_out" | "cancelled",
  ) => {
    n += 1;
    const [b] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `H-${n}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
      })
      .returning();
    await env.db.insert(stay).values({
      ...tenant,
      bookingId: b?.id ?? "",
      petId: petId ?? "",
      roomTypeId: typeId ?? "",
      roomUnitId: unitId,
      checkInDate,
      checkOutDate,
      nights: (Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86_400_000,
      nightlyPriceSatang: 0,
      roomTotalSatang: 0,
      status,
    });
  };
  // nights 10-05 and 10-06 in S1; two pets sharing L1 on 10-06 count once; checkout day 10-07 not counted
  await room(small?.id, s1, p1?.id, "2026-10-05", "2026-10-07", "checked_in");
  await room(large?.id, l1, p1?.id, "2026-10-06", "2026-10-07", "checked_out");
  await room(large?.id, l1, p2?.id, "2026-10-06", "2026-10-07", "checked_out");
  // started before the range: night 10-04 is outside, 10-05 is inside
  await room(small?.id, s2, p2?.id, "2026-10-04", "2026-10-06", "checked_out");
  // reserved / cancelled never count
  await room(small?.id, s2, p1?.id, "2026-10-07", "2026-10-08", "reserved");
  await room(large?.id, l1, p2?.id, "2026-10-05", "2026-10-06", "cancelled");
  return { small: small?.id ?? "", large: large?.id ?? "", archived: archived?.id ?? "" };
}

beforeAll(async () => {
  env = await setupTestDb();
  Object.assign(ids, await seedHotel(env.base));
  foreign = await otherOrg(env.db);
  await seedHotel(foreign);
});
afterAll(async () => {
  await env.close();
});

async function get(qs: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/reports/occupancy${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}

it("reports occupied active units per night and per room type", async () => {
  const response = await get(week);
  expect(response.status).toBe(200);
  // 3 active units (S1, S2, L1); S3 is under maintenance
  expect(ReportsOccupancyResponse.parse(await response.json())).toEqual({
    from: "2026-10-05",
    to: "2026-10-07",
    days: [
      { date: "2026-10-05", occupiedUnits: 2, totalUnits: 3, percent: 67 },
      { date: "2026-10-06", occupiedUnits: 2, totalUnits: 3, percent: 67 },
      { date: "2026-10-07", occupiedUnits: 0, totalUnits: 3, percent: 0 },
    ],
    byRoomType: [
      { roomTypeId: ids.small, roomTypeName: "ห้องเล็ก", occupiedNights: 3, totalNights: 6, percent: 50 },
      { roomTypeId: ids.large, roomTypeName: "ห้องใหญ่", occupiedNights: 1, totalNights: 3, percent: 33 },
    ],
  });
});

it("returns percent 0 for a branch without active room units", async () => {
  const empty = await seedOrg(env.db, "c");
  expect(await reportsOccupancy(staffCtx(empty, "owner"), { from: "2026-10-05", to: "2026-10-05" })).toEqual({
    from: "2026-10-05",
    to: "2026-10-05",
    days: [{ date: "2026-10-05", occupiedUnits: 0, totalUnits: 0, percent: 0 }],
    byRoomType: [],
  });
});

it("rejects missing, malformed, reversed and over-long ranges", async () => {
  for (const qs of [
    "",
    "?from=2026-10-05",
    "?to=2026-10-05",
    "?from=2026-10-5&to=2026-10-07",
    "?from=2026-02-30&to=2026-03-01",
    "?from=2026-10-07&to=2026-10-05",
    "?from=2026-01-01&to=2026-04-04",
  ]) {
    const response = await get(qs);
    expect(response.status, qs).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await get("?from=2026-01-01&to=2026-04-03")).status).toBe(200);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await get(week, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("denies customer actors", async () => {
  await expect(reportsOccupancy(customerCtx(env.base), { from: "2026-10-05", to: "2026-10-07" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's branch and never counts its rooms", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(
      reportsOccupancy({ ...staffCtx(env.base, "owner"), branchId }, { from: "2026-10-05", to: "2026-10-07" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  // the foreign org has the same hotel layout; our totals stay at 3 units
  const own = await reportsOccupancy(staffCtx(env.base, "owner"), { from: "2026-10-05", to: "2026-10-05" });
  expect(own.days).toEqual([{ date: "2026-10-05", occupiedUnits: 2, totalUnits: 3, percent: 67 }]);
});
