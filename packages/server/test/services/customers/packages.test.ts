import { CustomersPackagesRequest, CustomersPackagesResponse } from "@app/contracts/endpoints/customers.packages";
import { bill, billLine, customerPackage, packageRedemption, packageTemplate, pet, service } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { customersPackages } from "../../../src/services/customers/packages.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("customers.packages", { params: CustomersPackagesRequest }, customersPackages);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: svc?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const [b] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner, receiptNo: "R6910-0001" })
    .returning();
  const [line] = await env.db
    .insert(billLine)
    .values({
      organizationId: org.orgId,
      billId: b?.id ?? "",
      lineType: "package_redemption",
      description: "ใช้แพ็กเกจ",
      unitPriceSatang: 0,
      lineTotalSatang: 0,
    })
    .returning();
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
    .returning();
  ids.mochi = mochi?.id ?? "";
  const pkg = (extra: Partial<typeof customerPackage.$inferInsert>) => ({
    organizationId: org.orgId,
    customerId: org.customerId,
    templateId: tpl?.id ?? "",
    sessionsTotal: 5,
    unitValueSatang: 40_000,
    purchasedBillId: b?.id ?? "",
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    ...extra,
  });
  const [old, active, exhausted] = await env.db
    .insert(customerPackage)
    .values([
      pkg({ status: "expired", purchasedAt: new Date("2025-01-01T00:00:00.000Z"), expiresAt: new Date("2025-07-01T00:00:00.000Z") }),
      pkg({ petId: ids.mochi, sessionsUsed: 2, purchasedAt: new Date("2026-01-01T00:00:00.000Z") }),
      pkg({ status: "exhausted", sessionsUsed: 5, purchasedAt: new Date("2026-06-01T00:00:00.000Z") }),
    ])
    .returning();
  ids.old = old?.id ?? "";
  ids.active = active?.id ?? "";
  ids.exhausted = exhausted?.id ?? "";
  await env.db.insert(packageRedemption).values([
    {
      organizationId: org.orgId,
      customerPackageId: ids.active,
      billLineId: line?.id ?? "",
      petId: ids.mochi ?? "",
      performerId: org.staff.staff,
      redeemedAt: new Date("2026-09-01T04:00:00.000Z"),
    },
    {
      organizationId: org.orgId,
      customerPackageId: ids.active,
      billLineId: line?.id ?? "",
      petId: ids.mochi ?? "",
      performerId: null,
      redeemedAt: new Date("2026-09-15T04:00:00.000Z"),
      reversedAt: new Date("2026-09-16T04:00:00.000Z"),
    },
  ]);
});
afterAll(async () => {
  await env.close();
});

async function get(customerId: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}/packages`, { headers: { cookie: `sid=${login.token}` } }),
    {
      params: Promise.resolve({ customerId }),
    },
  );
}

it.each(["owner", "front_desk"] as const)("lists every package with every CustomerPackageItem field for %s", async (role) => {
  const response = await get(env.base.customerId, role);
  expect(response.status).toBe(200);
  const body = CustomersPackagesResponse.parse(await response.json());
  // active first, then newest purchase
  expect(body.map((p) => p.id)).toEqual([ids.active, ids.exhausted, ids.old]);
  expect(body[0]).toEqual({
    id: ids.active,
    templateName: "อาบ 5 ครั้ง",
    petId: ids.mochi,
    petName: "Mochi",
    sessionsTotal: 5,
    sessionsUsed: 2,
    sessionsLeft: 3,
    expiresAt: "2027-01-01T00:00:00.000Z",
    status: "active",
    redemptions: [
      { redeemedAt: "2026-09-01T04:00:00.000Z", petName: "Mochi", performerName: "staff", receiptNo: "R6910-0001", reversedAt: null },
      {
        redeemedAt: "2026-09-15T04:00:00.000Z",
        petName: "Mochi",
        performerName: null,
        receiptNo: "R6910-0001",
        reversedAt: "2026-09-16T04:00:00.000Z",
      },
    ],
  });
  expect(body[1]).toMatchObject({ petId: null, petName: null, sessionsLeft: 0, status: "exhausted", redemptions: [] });
});

it("returns an empty list for a customer without packages", async () => {
  expect(await customersPackages(staffCtx(foreign, "owner"), { customerId: foreign.customerId })).toEqual([]);
});

it("rejects a malformed customerId with VALIDATION_FAILED", async () => {
  const response = await get("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies role staff and customer actors", async () => {
  const response = await get(env.base.customerId, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(customersPackages(customerCtx(env.base), { customerId: env.base.customerId })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's customer or an unknown id", async () => {
  for (const customerId of [foreign.customerId, "00000000-0000-4000-8000-000000000000"]) {
    const response = await get(customerId);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  }
});
