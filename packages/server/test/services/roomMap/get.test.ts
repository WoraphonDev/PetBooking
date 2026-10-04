import { RoomMapGetQuery, RoomMapGetResponse } from "@app/contracts/endpoints/roomMap.get";
import { booking, pet, roomType, roomUnit, stay } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { roomMapGet } from "../../../src/services/roomMap/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("roomMap.get", { query: RoomMapGetQuery }, roomMapGet);
const DATE = "2026-10-05";
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const unitIds: Record<string, string> = {};
const stayIds: Record<string, string> = {};

async function seedUnit(org: SeedOrg, typeId: string, code: string, sortOrder: number) {
  const [u] = await env.db
    .insert(roomUnit)
    .values({ organizationId: org.orgId, branchId: org.branchId, roomTypeId: typeId, code, zone: "A", sortOrder })
    .returning();
  return u?.id ?? "";
}
async function seedStay(
  org: SeedOrg,
  typeId: string,
  unitId: string,
  checkInDate: string,
  checkOutDate: string,
  status: typeof stay.$inferInsert.status,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
    .returning();
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: typeId,
      roomUnitId: unitId,
      checkInDate,
      checkOutDate,
      nights: (Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86_400_000,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
      status,
    })
    .returning();
  return s?.id ?? "";
}

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const [t] = await env.db
    .insert(roomType)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, nameTh: "ห้องเล็ก" })
    .returning();
  const typeId = t?.id ?? "";
  // sort_order decides the order, not the code
  unitIds.r2 = await seedUnit(env.base, typeId, "R2", 2);
  unitIds.r1 = await seedUnit(env.base, typeId, "R1", 1);
  unitIds.r3 = await seedUnit(env.base, typeId, "R3", 3);
  unitIds.r4 = await seedUnit(env.base, typeId, "R4", 4);
  // R1: in the room tonight, another guest later
  stayIds.r1now = await seedStay(env.base, typeId, unitIds.r1, "2026-10-03", "2026-10-06", "checked_in");
  stayIds.r1next = await seedStay(env.base, typeId, unitIds.r1, "2026-10-12", "2026-10-14", "reserved");
  // R2: one pet still in on its check-out day, the next one arriving today
  stayIds.r2out = await seedStay(env.base, typeId, unitIds.r2, "2026-10-02", DATE, "checked_in");
  stayIds.r2in = await seedStay(env.base, typeId, unitIds.r2, DATE, "2026-10-07", "reserved");
  // R3: only a cancelled stay; R4: a pet that already went home today
  await seedStay(env.base, typeId, unitIds.r3, DATE, "2026-10-07", "cancelled");
  await seedStay(env.base, typeId, unitIds.r4, "2026-10-03", DATE, "checked_out");

  const [ot] = await env.db.insert(roomType).values({ organizationId: other.orgId, branchId: other.branchId, nameTh: "อื่น" }).returning();
  await seedUnit(other, ot?.id ?? "", "X1", 0);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function get(query: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(new Request(`https://petbooking.test/api/v1/staff/room-map${query}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: {},
  });
}

it("maps every unit of this branch only on the date (any staff role)", async () => {
  const res = await get(`?date=${DATE}`, "staff");
  expect(res.status).toBe(200);
  const map = RoomMapGetResponse.parse(await res.json());
  expect(map.date).toBe(DATE);
  expect(map.units.map((u) => u.code)).toEqual(["R1", "R2", "R3", "R4"]);
  const [r1, r2, r3, r4] = map.units;
  expect(r1).toMatchObject({
    id: unitIds.r1,
    zone: "A",
    roomTypeName: "ห้องเล็ก",
    status: "active",
    housekeeping: "clean",
    arrivingToday: false,
    departingToday: false,
    nextArrivalDate: "2026-10-12",
  });
  expect(r1?.occupant).toMatchObject({ id: stayIds.r1now, status: "checked_in", roomCode: "R1" });
  expect(r2).toMatchObject({ arrivingToday: true, departingToday: true, nextArrivalDate: null });
  expect(r2?.occupant?.id).toBe(stayIds.r2out);
  expect(r3).toMatchObject({ occupant: null, arrivingToday: false, departingToday: false, nextArrivalDate: null });
  expect(r4).toMatchObject({ occupant: null, arrivingToday: false, departingToday: true });
});

it("the next day: R2's reserved arrival holds the room, R1's pet is still in on its check-out day", async () => {
  const map = RoomMapGetResponse.parse(await (await get("?date=2026-10-06")).json());
  expect(map.units.find((u) => u.code === "R2")?.occupant?.id).toBe(stayIds.r2in);
  const r1 = map.units.find((u) => u.code === "R1");
  expect(r1).toMatchObject({ departingToday: true, nextArrivalDate: "2026-10-12" });
  expect(r1?.occupant?.id).toBe(stayIds.r1now);
});

it.each([
  ["missing date", ""],
  ["bad date", "?date=05-10-2026"],
  ["unknown parameter", `?date=${DATE}&x=1`],
])("VALIDATION_FAILED: %s", async (_n, query) => {
  expect(((await (await get(query)).json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});
