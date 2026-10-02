import {
  RoomUnitsHousekeepingParams,
  RoomUnitsHousekeepingRequest,
  RoomUnitsHousekeepingResponse,
} from "@app/contracts/endpoints/roomUnits.housekeeping";
import { branch, roomType, roomUnit } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { roomUnitsHousekeeping } from "../../../src/services/roomUnits/housekeeping.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const PATCH = withStaff(
  "roomUnits.housekeeping",
  { body: RoomUnitsHousekeepingRequest, params: RoomUnitsHousekeepingParams },
  roomUnitsHousekeeping,
);
let env: TestEnv;
let foreign: SeedOrg;
const ids = { type: "", unit: "", foreignUnit: "", otherBranchUnit: "" };

async function addUnit(org: SeedOrg, code: string, branchId = org.branchId) {
  const [rt] = await env.db.insert(roomType).values({ organizationId: org.orgId, branchId, nameTh: "ห้อง" }).returning();
  const [u] = await env.db
    .insert(roomUnit)
    .values({ organizationId: org.orgId, branchId, roomTypeId: rt?.id ?? "", code, zone: "ชั้น 2", sortOrder: 3 })
    .returning();
  return { type: rt?.id ?? "", unit: u?.id ?? "" };
}
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  Object.assign(ids, await addUnit(env.base, "A1"));
  foreign = await otherOrg(env.db);
  ids.foreignUnit = (await addUnit(foreign, "A1")).unit;
  // a second branch of the same organization
  const [b2] = await env.db.insert(branch).values({ organizationId: env.base.orgId, name: "สาขา 2", bookingSlug: "shop-a-2" }).returning();
  ids.otherBranchUnit = (await addUnit(env.base, "Z9", b2?.id ?? "")).unit;
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

async function patch(unitId: string, input: unknown, role: "owner" | "front_desk" | "staff" = "staff") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PATCH(
    new Request(`https://petbooking.test/api/v1/staff/room-units/${unitId}/housekeeping`, {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
    { params: Promise.resolve({ roomUnitId: unitId }) },
  );
}

it.each(["owner", "front_desk", "staff"] as const)("sets housekeeping for %s and returns the RoomUnitItem", async (role) => {
  for (const housekeeping of ["dirty", "clean"] as const) {
    const response = await patch(ids.unit, { housekeeping }, role);
    expect(response.status).toBe(200);
    expect(RoomUnitsHousekeepingResponse.parse(await response.json())).toEqual({
      id: ids.unit,
      roomTypeId: ids.type,
      code: "A1",
      zone: "ชั้น 2",
      status: "active",
      housekeeping,
      sortOrder: 3,
    });
    const [row] = await env.db.select().from(roomUnit).where(eq(roomUnit.id, ids.unit));
    expect(row?.housekeeping).toBe(housekeeping);
  }
});

it("stamps ctx.now", async () => {
  await roomUnitsHousekeeping(staffCtx(env.base, "staff"), { roomUnitId: ids.unit, housekeeping: "dirty" });
  const [row] = await env.db.select().from(roomUnit).where(eq(roomUnit.id, ids.unit));
  expect(row?.updatedAt).toEqual(TEST_NOW);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const [unitId, body] of [
    [ids.unit, {}],
    [ids.unit, { housekeeping: "messy" }],
    ["not-a-uuid", { housekeeping: "clean" }],
  ] as const) {
    const response = await patch(unitId, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("denies customer actors", async () => {
  await expect(roomUnitsHousekeeping(customerCtx(env.base), { roomUnitId: ids.unit, housekeeping: "clean" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's unit, another branch's unit or an unknown id", async () => {
  for (const unitId of [ids.foreignUnit, ids.otherBranchUnit, "00000000-0000-4000-8000-000000000000"]) {
    const response = await patch(unitId, { housekeeping: "dirty" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  }
  const [row] = await env.db.select().from(roomUnit).where(eq(roomUnit.id, ids.foreignUnit));
  expect(row?.housekeeping).toBe("clean");
});
