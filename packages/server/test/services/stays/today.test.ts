import { StaysTodayQuery, StaysTodayResponse } from "@app/contracts/endpoints/stays.today";
import { booking, pet, roomType, roomUnit, stay } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysToday } from "../../../src/services/stays/today.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.today", { query: StaysTodayQuery }, staysToday);
const DATE = "2026-10-05";
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const ids: Record<string, string> = {};

async function seedStay(org: SeedOrg, checkInDate: string, checkOutDate: string, status: typeof stay.$inferInsert.status) {
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
  const [t] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [u] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: t?.id ?? "", code: `R${String(seq).padStart(2, "0")}` })
    .returning();
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: t?.id ?? "",
      roomUnitId: u?.id ?? "",
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
  ids.arriving = await seedStay(env.base, DATE, "2026-10-07", "reserved");
  ids.arrived = await seedStay(env.base, DATE, "2026-10-06", "checked_in");
  ids.leaving = await seedStay(env.base, "2026-10-03", DATE, "checked_in");
  ids.left = await seedStay(env.base, "2026-10-02", DATE, "checked_out");
  ids.staying = await seedStay(env.base, "2026-10-01", "2026-10-09", "checked_in");
  ids.later = await seedStay(env.base, "2026-10-08", "2026-10-10", "reserved");
  ids.cancelled = await seedStay(env.base, DATE, "2026-10-07", "cancelled");
  ids.foreign = await seedStay(other, DATE, "2026-10-07", "reserved");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function list(query: string) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.staff, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(new Request(`https://petbooking.test/api/v1/staff/stays${query}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: {},
  });
}
const idsOf = async (query: string) => {
  const res = await list(query);
  expect(res.status).toBe(200);
  return StaysTodayResponse.parse(await res.json()).map((s) => s.id);
};

it("arrivals / departures / in_house of this branch on the date (role staff)", async () => {
  expect(await idsOf(`?date=${DATE}&type=arrivals`)).toEqual([ids.arriving, ids.arrived]);
  expect(await idsOf(`?date=${DATE}&type=departures`)).toEqual([ids.left, ids.leaving]);
  expect(await idsOf(`?date=${DATE}&type=in_house`)).toEqual([ids.staying, ids.leaving, ids.arrived]);
});

it("without type: every stay arriving, leaving or in house, each once; other orgs and cancelled stays never show", async () => {
  const all = await idsOf(`?date=${DATE}`);
  expect(all).toEqual([ids.staying, ids.left, ids.leaving, ids.arriving, ids.arrived]);
  expect(all).not.toContain(ids.foreign);
  expect(all).not.toContain(ids.cancelled);
  expect(all).not.toContain(ids.later);
});

it.each([
  ["missing date", ""],
  ["bad date", "?date=2026/10/05"],
  ["unknown type", `?date=${DATE}&type=all`],
])("VALIDATION_FAILED: %s", async (_n, query) => {
  expect(((await (await list(query)).json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});
