import { PackageTemplatesListRequest, PackageTemplatesListResponse } from "@app/contracts/endpoints/packageTemplates.list";
import { packageTemplate, service, sizeTier } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { packageTemplatesList } from "../../../src/services/packageTemplates/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let serviceId: string;
let tierId: string;
const GET = withStaff("packageTemplates.list", { query: PackageTemplatesListRequest }, packageTemplatesList);
async function addService(org: SeedOrg) {
  const [svc] = await env.db
    .insert(service)
    .values({ organizationId: org.orgId, branchId: org.branchId, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  return svc?.id ?? "";
}
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  serviceId = await addService(env.base);
  const [t] = await env.db
    .insert(sizeTier)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0 })
    .returning();
  tierId = t?.id ?? "";
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(packageTemplate);
  resetRateLimits();
});
async function get(query = "", role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/package-templates${query}`, { headers: { cookie: `sid=${login.token}` } }));
}
const tpl = (nameTh: string, at: number, extra: Partial<typeof packageTemplate.$inferInsert> = {}) => ({
  organizationId: env.base.orgId,
  branchId: env.base.branchId,
  nameTh,
  serviceId,
  sessionsCount: 10,
  priceSatang: 300000,
  createdAt: new Date(TEST_NOW.getTime() + at),
  updatedAt: TEST_NOW,
  ...extra,
});

it.each(["owner", "front_desk", "staff"] as const)("lists every PackageTemplateItem field with R-14 unit value for %s", async (role) => {
  await env.db.insert(packageTemplate).values([
    tpl("อาบ 3 ครั้ง", 1000, {
      sessionsCount: 3,
      priceSatang: 100000,
      sizeTierId: tierId,
      validityDays: 90,
      shareScope: "household",
      status: "archived",
    }),
    tpl("อาบ 10 ครั้ง", 0),
  ]);
  const response = await get("", role);
  expect(response.status).toBe(200);
  const body = PackageTemplatesListResponse.parse(await response.json());
  const rows = await env.db.select().from(packageTemplate);
  const byName = new Map(rows.map((r) => [r.nameTh, r]));
  expect(body).toEqual(
    ["อาบ 10 ครั้ง", "อาบ 3 ครั้ง"].map((name) => {
      const r = byName.get(name);
      return {
        id: r?.id,
        nameTh: name,
        serviceId,
        serviceName: "อาบน้ำ",
        sizeTierId: r?.sizeTierId,
        sessionsCount: r?.sessionsCount,
        priceSatang: r?.priceSatang,
        validityDays: r?.validityDays,
        shareScope: r?.shareScope,
        status: r?.status,
        unitValueSatang: Math.floor((r?.priceSatang ?? 0) / (r?.sessionsCount ?? 1)),
      };
    }),
  );
  expect(body.map((b) => [b.unitValueSatang, b.validityDays, b.shareScope, b.status])).toEqual([
    [30000, 365, "single_pet", "active"],
    [33333, 90, "household", "archived"],
  ]);
});

it("rejects unknown query parameters", async () => {
  const response = await get("?status=active");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies absent sessions and customer actors", async () => {
  expect((await GET(new Request("https://petbooking.test/api/v1/staff/package-templates"))).status).toBe(401);
  await expect(packageTemplatesList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch and never lists its templates", async () => {
  const foreign = await otherOrg(env.db);
  const foreignService = await addService(foreign);
  await env.db
    .insert(packageTemplate)
    .values({ ...tpl("ต่างร้าน", 0), organizationId: foreign.orgId, branchId: foreign.branchId, serviceId: foreignService });
  for (const branchId of [foreign.branchId, null]) {
    await expect(packageTemplatesList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await packageTemplatesList(staffCtx(env.base, "owner"), {})).toEqual([]);
});
