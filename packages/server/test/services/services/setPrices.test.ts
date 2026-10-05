import { ServicesSetPricesParams, ServicesSetPricesRequest, ServicesSetPricesResponse } from "@app/contracts/endpoints/services.setPrices";
import { ratePlan, service, servicePrice, sizeTier } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { servicesSetPrices } from "../../../src/services/services/setPrices.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("services.setPrices", { body: ServicesSetPricesRequest, params: ServicesSetPricesParams }, servicesSetPrices);
let env: TestEnv;
let other: SeedOrg;
const ids = { plan: "", oldPlan: "", small: "", large: "", foreignTier: "", foreignService: "" };
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "Standard" })
    .returning();
  const [old] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, code: "old", name: "Old", isDefault: false })
    .returning();
  const tiers = await env.db
    .insert(sizeTier)
    .values([
      { ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 },
      { ...tenant, species: "dog", code: "L", labelTh: "ใหญ่", minWeightGrams: 10_001, maxWeightGrams: null },
    ])
    .returning();
  const [ft] = await env.db
    .insert(sizeTier)
    .values({ organizationId: other.orgId, branchId: other.branchId, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0 })
    .returning();
  const [fs] = await env.db
    .insert(service)
    .values({ organizationId: other.orgId, branchId: other.branchId, scope: "grooming", category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  Object.assign(ids, {
    plan: plan?.id,
    oldPlan: old?.id,
    small: tiers[0]?.id,
    large: tiers[1]?.id,
    foreignTier: ft?.id,
    foreignService: fs?.id,
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

let seq = 0;
async function newService() {
  const [s] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, scope: "grooming", category: "bath", nameTh: `อาบน้ำ${++seq}` })
    .returning();
  return s?.id ?? "";
}
async function put(serviceId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/services/${serviceId}/prices`, {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { serviceId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const pricesOf = async (serviceId: string, planId = ids.plan) =>
  (
    await env.db
      .select()
      .from(servicePrice)
      .where(and(eq(servicePrice.serviceId, serviceId), eq(servicePrice.ratePlanId, planId)))
  )
    .map((p) => [p.sizeTierId, p.coatGroup, p.priceSatang, p.durationMinutes])
    .sort((a, b) => String(a).localeCompare(String(b)));

it("replaces the default plan's whole price table and answers the ServiceItem; other plans stay", async () => {
  const id = await newService();
  await env.db.insert(servicePrice).values([
    {
      organizationId: env.base.orgId,
      serviceId: id,
      ratePlanId: ids.plan,
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 1,
      durationMinutes: 1,
    },
    {
      organizationId: env.base.orgId,
      serviceId: id,
      ratePlanId: ids.oldPlan,
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 2,
      durationMinutes: 2,
    },
  ]);
  const res = await put(id, {
    prices: [
      { sizeTierId: ids.small, coatGroup: "short", priceSatang: 30_000, durationMinutes: 60 },
      { sizeTierId: ids.large, coatGroup: "long", priceSatang: 80_000, durationMinutes: 120 },
      { sizeTierId: null, coatGroup: "any", priceSatang: 50_000, durationMinutes: 90 },
    ],
  });
  expect(res.status).toBe(200);
  const item = ServicesSetPricesResponse.parse(await res.json());
  expect(item.id).toBe(id);
  expect(await pricesOf(id)).toEqual(
    [
      [ids.small, "short", 30_000, 60],
      [ids.large, "long", 80_000, 120],
      [null, "any", 50_000, 90],
    ].sort((a, b) => String(a).localeCompare(String(b))),
  );
  expect(await pricesOf(id, ids.oldPlan)).toEqual([[null, "any", 2, 2]]);
  // an empty table clears the default plan's prices
  await put(id, { prices: [] });
  expect(await pricesOf(id)).toEqual([]);
});

it.each([
  [
    "the same tier and coat twice",
    {
      prices: [
        { sizeTierId: null, coatGroup: "any", priceSatang: 1, durationMinutes: 0 },
        { coatGroup: "any", priceSatang: 2, durationMinutes: 0 },
      ],
    },
  ],
  ["price over 10,000,000", { prices: [{ coatGroup: "any", priceSatang: 10_000_001, durationMinutes: 0 }] }],
  ["duration over 600", { prices: [{ coatGroup: "any", priceSatang: 1, durationMinutes: 601 }] }],
  ["unknown coat", { prices: [{ coatGroup: "curly", priceSatang: 1, durationMinutes: 0 }] }],
  ["missing prices", {}],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await put(await newService(), body))).toBe("VALIDATION_FAILED");
});

it("another shop's size tier → VALIDATION_FAILED; nothing changes", async () => {
  const id = await newService();
  await put(id, { prices: [{ coatGroup: "any", priceSatang: 50_000, durationMinutes: 60 }] });
  expect(
    await codeOf(await put(id, { prices: [{ sizeTierId: ids.foreignTier, coatGroup: "any", priceSatang: 1, durationMinutes: 0 }] })),
  ).toBe("VALIDATION_FAILED");
  expect(await pricesOf(id)).toEqual([[null, "any", 50_000, 60]]);
});

it("front_desk / staff → FORBIDDEN; another org's service → NOT_FOUND", async () => {
  const body = { prices: [{ coatGroup: "any", priceSatang: 1, durationMinutes: 0 }] };
  for (const role of ["front_desk", "staff"] as const) expect(await codeOf(await put(await newService(), body, role))).toBe("FORBIDDEN");
  expect(await codeOf(await put(ids.foreignService, body))).toBe("NOT_FOUND");
});
