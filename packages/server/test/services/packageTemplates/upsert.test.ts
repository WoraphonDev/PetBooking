import { PackageTemplatesUpsertRequest, PackageTemplatesUpsertResponse } from "@app/contracts/endpoints/packageTemplates.upsert";
import { packageTemplate, service, sizeTier } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { packageTemplatesUpsert } from "../../../src/services/packageTemplates/upsert.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
const ids = { bath: "", addon: "", hotel: "", tier: "", foreignService: "", foreignTier: "" };
const PUT = withStaff("packageTemplates.upsert", { body: PackageTemplatesUpsertRequest }, packageTemplatesUpsert);
async function addService(org: SeedOrg, extra: Partial<typeof service.$inferInsert> = {}) {
  const [svc] = await env.db
    .insert(service)
    .values({ organizationId: org.orgId, branchId: org.branchId, category: "bath", nameTh: "อาบน้ำ", ...extra })
    .returning();
  return svc?.id ?? "";
}
async function addTier(org: SeedOrg) {
  const [t] = await env.db
    .insert(sizeTier)
    .values({ organizationId: org.orgId, branchId: org.branchId, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0 })
    .returning();
  return t?.id ?? "";
}
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  ids.bath = await addService(env.base);
  ids.addon = await addService(env.base, { nameTh: "ตัดเล็บ", category: "nail", isAddon: true });
  ids.hotel = await addService(env.base, { nameTh: "อาบก่อนกลับ", category: "hotel_addon", scope: "hotel" });
  ids.tier = await addTier(env.base);
  ids.foreignService = await addService(foreign);
  ids.foreignTier = await addTier(foreign);
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(packageTemplate);
  resetRateLimits();
});
async function put(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/package-templates", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const owner = () => staffCtx(env.base, "owner");
const item = (extra: Record<string, unknown> = {}) => ({
  nameTh: "อาบ 10 ครั้ง",
  serviceId: ids.bath,
  sessionsCount: 10,
  priceSatang: 300000,
  validityDays: 365,
  shareScope: "single_pet" as const,
  status: "active" as const,
  ...extra,
});

it("creates templates and returns the branch's PackageTemplateItem[] with every column stored", async () => {
  const response = await put({
    items: [
      item(),
      item({
        nameTh: " อาบ 3 ครั้ง ",
        sessionsCount: 3,
        priceSatang: 100000,
        sizeTierId: ids.tier,
        validityDays: 90,
        shareScope: "household",
      }),
    ],
  });
  expect(response.status).toBe(200);
  const body = PackageTemplatesUpsertResponse.parse(await response.json());
  // both rows share created_at, so compare in a fixed order (10 sessions first)
  const byName = [...body].sort((x, y) => x.sessionsCount - y.sessionsCount).reverse();
  expect(
    byName.map((b) => [
      b.nameTh,
      b.serviceName,
      b.sizeTierId,
      b.sessionsCount,
      b.priceSatang,
      b.validityDays,
      b.shareScope,
      b.status,
      b.unitValueSatang,
    ]),
  ).toEqual([
    ["อาบ 10 ครั้ง", "อาบน้ำ", null, 10, 300000, 365, "single_pet", "active", 30000],
    ["อาบ 3 ครั้ง", "อาบน้ำ", ids.tier, 3, 100000, 90, "household", "active", 33333],
  ]);
  const rows = await env.db.select().from(packageTemplate);
  for (const b of body) {
    expect(rows.find((r) => r.id === b.id)).toMatchObject({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      nameTh: b.nameTh,
      serviceId: b.serviceId,
      sizeTierId: b.sizeTierId,
      sessionsCount: b.sessionsCount,
      priceSatang: b.priceSatang,
      validityDays: b.validityDays,
      shareScope: b.shareScope,
      status: b.status,
    });
  }
});

it("updates by id, archives via status, and leaves templates that were not sent untouched", async () => {
  const [a, b] = await packageTemplatesUpsert(owner(), { items: [item(), item({ nameTh: "อีกอัน" })] });
  const result = await packageTemplatesUpsert(owner(), { items: [{ ...item({ id: a?.id, priceSatang: 250000, status: "archived" }) }] });
  expect(result.map((r) => [r.id, r.priceSatang, r.status, r.unitValueSatang])).toEqual([
    [a?.id, 250000, "archived", 25000],
    [b?.id, 300000, "active", 30000],
  ]);
  const [row] = await env.db
    .select()
    .from(packageTemplate)
    .where(eq(packageTemplate.id, a?.id ?? ""));
  expect(row?.updatedAt).toEqual(TEST_NOW);
});

it("rejects missing and malformed fields, and services that are not main grooming services", async () => {
  for (const invalid of [
    {},
    { items: [{ ...item(), nameTh: undefined }] },
    { items: [item({ nameTh: "  " })] },
    { items: [item({ serviceId: "nope" })] },
    { items: [item({ sessionsCount: 1 })] },
    { items: [item({ sessionsCount: 51 })] },
    { items: [item({ priceSatang: 0 })] },
    { items: [item({ priceSatang: 10.5 })] },
    { items: [item({ validityDays: 0 })] },
    { items: [item({ validityDays: 731 })] },
    { items: [item({ shareScope: "family" })] },
    { items: [item({ status: "deleted" })] },
    { items: [item({ serviceId: ids.addon })] },
    { items: [item({ serviceId: ids.hotel })] },
  ]) {
    const response = await put(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(packageTemplate)).toHaveLength(0);
  expect((await put({ items: [item({ sessionsCount: 50, validityDays: 730 })] })).status).toBe(200);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await put({ items: [item()] }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(await env.db.select().from(packageTemplate)).toHaveLength(0);
});

it("denies absent sessions and customer actors", async () => {
  expect((await PUT(new Request("https://petbooking.test/api/v1/staff/package-templates", { method: "PUT" }))).status).toBe(401);
  await expect(packageTemplatesUpsert(customerCtx(env.base), { items: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch, template, service or size tier without writing", async () => {
  for (const branchId of [foreign.branchId, null]) {
    await expect(packageTemplatesUpsert({ ...owner(), branchId }, { items: [item()] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  const [foreignTpl] = await packageTemplatesUpsert(staffCtx(foreign, "owner"), { items: [item({ serviceId: ids.foreignService })] });
  for (const bad of [item({ id: foreignTpl?.id }), item({ serviceId: ids.foreignService }), item({ sizeTierId: ids.foreignTier })]) {
    await expect(packageTemplatesUpsert(owner(), { items: [bad] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  const rows = await env.db.select().from(packageTemplate);
  expect(rows.map((r) => r.branchId)).toEqual([foreign.branchId]);
});
