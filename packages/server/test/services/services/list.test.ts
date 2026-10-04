import { ServicesListQuery, ServicesListResponse } from "@app/contracts/endpoints/services.list";
import { fileObject, ratePlan, service, serviceAddonLink, servicePrice } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { servicesList } from "../../../src/services/services/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  await env.close();
});

let baseId: string;
beforeAll(async () => {
  setStorage(createFakeStorage());
  const rows = await env.db
    .insert(service)
    .values([
      { organizationId: env.base.orgId, branchId: env.base.branchId, scope: "grooming", category: "bath", nameTh: "Bath" },
      {
        organizationId: env.base.orgId,
        branchId: env.base.branchId,
        scope: "hotel",
        category: "hotel_addon",
        nameTh: "Food",
        isAddon: true,
      },
      {
        organizationId: env.base.orgId,
        branchId: env.base.branchId,
        scope: "grooming",
        category: "spa",
        nameTh: "Old",
        status: "archived",
      },
      { organizationId: foreign.orgId, branchId: foreign.branchId, scope: "grooming", category: "bath", nameTh: "Foreign" },
    ])
    .returning();
  baseId = rows[0]!.id;
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, name: "Standard" })
    .returning();
  await env.db.insert(servicePrice).values({
    organizationId: env.base.orgId,
    serviceId: baseId,
    ratePlanId: plan!.id,
    coatGroup: "any",
    priceSatang: 10000,
    durationMinutes: 30,
  });
  await env.db.insert(serviceAddonLink).values({ organizationId: env.base.orgId, addonServiceId: rows[1]!.id, baseServiceId: baseId });
});
afterAll(() => setStorage(null));
it.each(["owner", "front_desk", "staff"] as const)("lists this branch's services for %s", async (role) => {
  const rows = ServicesListResponse.parse(await servicesList(staffCtx(env.base, role), ServicesListQuery.parse({})));
  expect(rows.map((r) => r.nameTh).sort()).toEqual(["Bath", "Food"]);
  expect(rows.find((r) => r.id === baseId)).toMatchObject({
    prices: [{ sizeTierId: null, coatGroup: "any", priceSatang: 10000, durationMinutes: 30 }],
    fromPriceSatang: 10000,
  });
  expect(rows.find((r) => r.nameTh === "Food")!.addonForServiceIds).toEqual([baseId]);
});
it("honors scope/includeArchived=false strings and archived inclusion", async () => {
  expect(
    (await servicesList(staffCtx(env.base, "owner"), ServicesListQuery.parse({ scope: "grooming", includeArchived: "false" }))).map(
      (r) => r.nameTh,
    ),
  ).toEqual(["Bath"]);
  expect(await servicesList(staffCtx(env.base, "owner"), ServicesListQuery.parse({ includeArchived: "true" }))).toHaveLength(3);
  expect(ServicesListQuery.safeParse({ scope: "bad" }).success).toBe(false);
});
it("rejects a foreign branch", async () => {
  await expect(
    servicesList({ ...staffCtx(env.base, "owner"), branchId: foreign.branchId }, ServicesListQuery.parse({})),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("signs service photos and calculates the minimum of every price", async () => {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "service_photo",
      storageKey: "list-service.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("file fixture");
  await env.db.update(service).set({ photoFileId: f.id }).where(eq(service.id, baseId));
  const [price] = await env.db.select().from(servicePrice);
  if (!price) throw new Error("price fixture");
  await env.db
    .insert(servicePrice)
    .values({ ...price, id: crypto.randomUUID(), coatGroup: "long", priceSatang: 8000, durationMinutes: 45 });
  const row = (await servicesList(staffCtx(env.base, "owner"), ServicesListQuery.parse({}))).find((s) => s.id === baseId);
  expect(row).toMatchObject({ photoUrl: expect.stringContaining("list-service.jpg?op=get"), fromPriceSatang: 8000 });
  expect(row?.prices).toEqual(
    expect.arrayContaining([
      { sizeTierId: null, coatGroup: "long", priceSatang: 8000, durationMinutes: 45 },
      { sizeTierId: null, coatGroup: "any", priceSatang: 10000, durationMinutes: 30 },
    ]),
  );
  await expect(servicesList(customerCtx(env.base), ServicesListQuery.parse({}))).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("returns HTTP VALIDATION_FAILED for invalid filters", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const GET = withStaff("services.list", { query: ServicesListQuery }, servicesList);
  for (const query of ["scope=bad", "includeArchived=bad"]) {
    const response = await GET(
      new Request(`https://petbooking.test/api/v1/staff/services?${query}`, { headers: { cookie: `sid=${login.token}` } }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
