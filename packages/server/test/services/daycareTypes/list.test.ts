import { DaycareTypesListRequest, DaycareTypesListResponse } from "@app/contracts/endpoints/daycareTypes.list";
import { daycareRate, daycareSessionType, ratePlan, sizeTier } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { daycareTypesList } from "../../../src/services/daycareTypes/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("daycareTypes.list", { query: DaycareTypesListRequest }, daycareTypesList);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

async function seedDaycare(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [plan, otaPlan] = await env.db
    .insert(ratePlan)
    .values([
      { ...tenant, name: "ราคาปกติ" },
      { ...tenant, code: "ota", name: "OTA", isDefault: false },
    ])
    .returning();
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0 })
    .returning();
  const [afternoon, full] = await env.db
    .insert(daycareSessionType)
    .values([
      { ...tenant, session: "afternoon", nameTh: "ครึ่งวันบ่าย", startsAt: "13:00", endsAt: "18:00", capacity: 8, status: "archived" },
      { ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 12 },
    ])
    .returning();
  await env.db.insert(daycareRate).values([
    {
      organizationId: org.orgId,
      sessionTypeId: full?.id ?? "",
      ratePlanId: plan?.id ?? "",
      sizeTierId: tier?.id ?? "",
      priceSatang: 45_000,
    },
    { organizationId: org.orgId, sessionTypeId: full?.id ?? "", ratePlanId: plan?.id ?? "", sizeTierId: null, priceSatang: 50_000 },
    // another plan's price is not shown (MVP shows the default plan)
    { organizationId: org.orgId, sessionTypeId: full?.id ?? "", ratePlanId: otaPlan?.id ?? "", sizeTierId: null, priceSatang: 60_000 },
  ]);
  return { full: full?.id ?? "", afternoon: afternoon?.id ?? "", tier: tier?.id ?? "" };
}

beforeAll(async () => {
  env = await setupTestDb();
  Object.assign(ids, await seedDaycare(env.base));
  foreign = await otherOrg(env.db);
  await seedDaycare(foreign);
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
  return GET(new Request(`https://petbooking.test/api/v1/staff/daycare-session-types${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}

it.each(["owner", "front_desk", "staff"] as const)("lists every DaycareSessionTypeItem field for %s, in session order", async (role) => {
  const response = await get("", role);
  expect(response.status).toBe(200);
  expect(DaycareTypesListResponse.parse(await response.json())).toEqual([
    {
      id: ids.full,
      session: "full_day",
      nameTh: "เต็มวัน",
      startsAt: "08:00",
      endsAt: "18:00",
      capacity: 12,
      status: "active",
      rates: [
        { sizeTierId: null, priceSatang: 50_000 },
        { sizeTierId: ids.tier, priceSatang: 45_000 },
      ],
    },
    {
      id: ids.afternoon,
      session: "afternoon",
      nameTh: "ครึ่งวันบ่าย",
      startsAt: "13:00",
      endsAt: "18:00",
      capacity: 8,
      status: "archived",
      rates: [],
    },
  ]);
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const response = await get("?branchId=x");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies customer actors", async () => {
  await expect(daycareTypesList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch and never lists its sessions", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(daycareTypesList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  const own = await daycareTypesList(staffCtx(env.base, "owner"), {});
  expect(own.map((t) => t.id)).toEqual([ids.full, ids.afternoon]);
});
