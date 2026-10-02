import { RoomUnitsListRequest, RoomUnitsListResponse } from "@app/contracts/endpoints/roomUnits.list";
import { roomType, roomUnit } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { roomUnitsList } from "../../../src/services/roomUnits/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("roomUnits.list", { query: RoomUnitsListRequest }, roomUnitsList);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

async function seedRooms(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [rt] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [b2, a1, a2] = await env.db
    .insert(roomUnit)
    .values([
      { ...tenant, roomTypeId: rt?.id ?? "", code: "B2", sortOrder: 2, status: "archived" },
      { ...tenant, roomTypeId: rt?.id ?? "", code: "A1", zone: "ชั้น 1", sortOrder: 1, housekeeping: "dirty" },
      { ...tenant, roomTypeId: rt?.id ?? "", code: "A0", sortOrder: 1, status: "maintenance" },
    ])
    .returning();
  return { type: rt?.id ?? "", b2: b2?.id ?? "", a1: a1?.id ?? "", a0: a2?.id ?? "" };
}

beforeAll(async () => {
  env = await setupTestDb();
  Object.assign(ids, await seedRooms(env.base));
  foreign = await otherOrg(env.db);
  await seedRooms(foreign);
});
afterAll(async () => {
  await env.close();
});

async function get(qs = "", role: "owner" | "front_desk" | "staff" = "staff") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/room-units${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}

it.each(["owner", "front_desk", "staff"] as const)("lists every RoomUnitItem field for %s by sort_order then code", async (role) => {
  const response = await get("", role);
  expect(response.status).toBe(200);
  expect(RoomUnitsListResponse.parse(await response.json())).toEqual([
    { id: ids.a0, roomTypeId: ids.type, code: "A0", zone: null, status: "maintenance", housekeeping: "clean", sortOrder: 1 },
    { id: ids.a1, roomTypeId: ids.type, code: "A1", zone: "ชั้น 1", status: "active", housekeeping: "dirty", sortOrder: 1 },
    { id: ids.b2, roomTypeId: ids.type, code: "B2", zone: null, status: "archived", housekeeping: "clean", sortOrder: 2 },
  ]);
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const response = await get("?status=active");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies customer actors", async () => {
  await expect(roomUnitsList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch and never lists its units", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(roomUnitsList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await roomUnitsList(staffCtx(env.base, "owner"), {})).map((u) => u.id)).toEqual([ids.a0, ids.a1, ids.b2]);
});
