import { RoomUnitsUpsertRequest, RoomUnitsUpsertResponse } from "@app/contracts/endpoints/roomUnits.upsert";
import { booking, pet, roomType, roomUnit, stay } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { roomUnitsUpsert } from "../../../src/services/roomUnits/upsert.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const PUT = withStaff("roomUnits.upsert", { body: RoomUnitsUpsertRequest }, roomUnitsUpsert);
let env: TestEnv;
let foreign: SeedOrg;
const ids = { small: "", large: "", foreignType: "", foreignUnit: "", pet: "" };
const unitsOf = (branchId: string) => env.db.select().from(roomUnit).where(eq(roomUnit.branchId, branchId));

async function addType(org: SeedOrg, nameTh: string) {
  const [rt] = await env.db.insert(roomType).values({ organizationId: org.orgId, branchId: org.branchId, nameTh }).returning();
  return rt?.id ?? "";
}
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  ids.small = await addType(env.base, "ห้องเล็ก");
  ids.large = await addType(env.base, "ห้องใหญ่");
  foreign = await otherOrg(env.db);
  ids.foreignType = await addType(foreign, "ห้อง");
  const [fu] = await env.db
    .insert(roomUnit)
    .values({ organizationId: foreign.orgId, branchId: foreign.branchId, roomTypeId: ids.foreignType, code: "F1" })
    .returning();
  ids.foreignUnit = fu?.id ?? "";
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "Mochi", species: "dog" })
    .returning();
  ids.pet = p?.id ?? "";
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(stay);
  await env.db.delete(roomUnit).where(eq(roomUnit.branchId, env.base.branchId));
  resetRateLimits();
});
async function put(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/room-units", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const upsert = (units: unknown[]) => roomUnitsUpsert(staffCtx(env.base, "owner"), RoomUnitsUpsertRequest.parse({ units }));
const unit = (code: string, extra: Record<string, unknown> = {}) => ({
  roomTypeId: ids.small,
  code,
  status: "active",
  sortOrder: 0,
  ...extra,
});
async function openStay(roomUnitId: string, status: "reserved" | "checked_in" | "checked_out" | "cancelled", day: number) {
  const [b] = await env.db
    .insert(booking)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      bookingNo: `H-${status}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  await env.db.insert(stay).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    bookingId: b?.id ?? "",
    petId: ids.pet,
    roomTypeId: ids.small,
    roomUnitId,
    // separate windows: the same pet cannot have overlapping stays
    checkInDate: `2026-10-${10 + day * 2}`,
    checkOutDate: `2026-10-${12 + day * 2}`,
    nights: 2,
    nightlyPriceSatang: 0,
    roomTotalSatang: 0,
    status,
  });
}

it("creates units and returns every RoomUnitItem field", async () => {
  const response = await put({
    units: [unit(" B1 ", { zone: " ชั้น 2 ", sortOrder: 2 }), unit("A1", { roomTypeId: ids.large, status: "maintenance", sortOrder: 1 })],
  });
  expect(response.status).toBe(200);
  expect(RoomUnitsUpsertResponse.parse(await response.json())).toEqual([
    { id: expect.any(String), roomTypeId: ids.large, code: "A1", zone: null, status: "maintenance", housekeeping: "clean", sortOrder: 1 },
    { id: expect.any(String), roomTypeId: ids.small, code: "B1", zone: "ชั้น 2", status: "active", housekeeping: "clean", sortOrder: 2 },
  ]);
  const rows = await unitsOf(env.base.branchId);
  expect(rows.find((r) => r.code === "B1")).toMatchObject({ organizationId: env.base.orgId, roomTypeId: ids.small, zone: "ชั้น 2" });
});

it("updates by id (including swapped codes) and leaves unsent units untouched", async () => {
  const [a1, a2, a3] = await upsert([unit("A1"), unit("A2", { sortOrder: 1 }), unit("A3", { sortOrder: 2 })]);
  const result = await upsert([
    unit("A2", { id: a1?.id, roomTypeId: ids.large, zone: "สวน", status: "archived" }),
    unit("A1", { id: a2?.id, sortOrder: 1 }),
  ]);
  expect(result).toEqual([
    { id: a1?.id, roomTypeId: ids.large, code: "A2", zone: "สวน", status: "archived", housekeeping: "clean", sortOrder: 0 },
    { id: a2?.id, roomTypeId: ids.small, code: "A1", zone: null, status: "active", housekeeping: "clean", sortOrder: 1 },
    { id: a3?.id, roomTypeId: ids.small, code: "A3", zone: null, status: "active", housekeeping: "clean", sortOrder: 2 },
  ]);
  const [row] = await env.db
    .select()
    .from(roomUnit)
    .where(eq(roomUnit.id, a1?.id ?? ""));
  expect(row).toMatchObject({ createdAt: TEST_NOW, updatedAt: TEST_NOW });
});

it("returns CODE_TAKEN for a code used by another unit or repeated in the request", async () => {
  await upsert([unit("A1")]);
  for (const units of [[unit("A1")], [unit("B1"), unit("B1")]]) {
    const response = await put({ units });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CODE_TAKEN" } });
  }
  expect((await unitsOf(env.base.branchId)).map((u) => u.code)).toEqual(["A1"]);
});

it("returns IN_USE when a unit with a reserved or checked-in stay goes to maintenance/archived", async () => {
  const [a1, a2, a3] = await upsert([unit("A1"), unit("A2"), unit("A3")]);
  await openStay(a1?.id ?? "", "reserved", 0);
  await openStay(a2?.id ?? "", "checked_in", 1);
  await openStay(a3?.id ?? "", "checked_out", 2);
  for (const [id, status] of [
    [a1?.id, "maintenance"],
    [a2?.id, "archived"],
  ] as const) {
    const response = await put({ units: [unit(id === a1?.id ? "A1" : "A2", { id, status })] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "IN_USE" } });
  }
  // finished stays do not block; renaming a busy unit is fine
  expect((await upsert([unit("A3", { id: a3?.id, status: "archived" }), unit("A1x", { id: a1?.id })])).map((u) => u.status)).toEqual([
    "active",
    "active",
    "archived",
  ]);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const units of [
    [{ ...unit("A1"), roomTypeId: undefined }],
    [{ ...unit("A1"), roomTypeId: "x" }],
    [unit("")],
    [unit("   ")],
    [unit("ABCDEFGHIJK")],
    [unit("A1", { status: "closed" })],
    [unit("A1", { sortOrder: 1.5 })],
    [{ ...unit("A1"), sortOrder: undefined }],
    [unit("A1", { id: "x" })],
  ]) {
    const response = await put({ units });
    expect(response.status, JSON.stringify(units)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await put({})).status).toBe(422);
  expect(await unitsOf(env.base.branchId)).toEqual([]);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await put({ units: [unit("A1")] }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("denies customer actors", async () => {
  await expect(roomUnitsUpsert(customerCtx(env.base), { units: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch, unit or room type without writing", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(roomUnitsUpsert({ ...staffCtx(env.base, "owner"), branchId }, { units: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(upsert([unit("Z1", { id: ids.foreignUnit })])).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(upsert([unit("Z1", { roomTypeId: ids.foreignType })])).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await unitsOf(env.base.branchId)).toEqual([]);
  const [fu] = await env.db.select().from(roomUnit).where(eq(roomUnit.id, ids.foreignUnit));
  expect(fu?.code).toBe("F1");
});
