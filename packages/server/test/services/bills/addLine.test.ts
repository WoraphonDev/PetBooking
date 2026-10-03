import { BillsAddLineParams, BillsAddLineRequest, BillsAddLineResponse } from "@app/contracts/endpoints/bills.addLine";
import { bill, billLine, customerPackage, packageRedemption, packageTemplate, pet, service, staffUser } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { billsAddLine } from "../../../src/services/bills/addLine.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("bills.addLine", { body: BillsAddLineRequest, params: BillsAddLineParams }, billsAddLine);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};
const later = new Date(TEST_NOW.getTime() + 86_400_000 * 300);

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [open, walkIn, paid] = await env.db
    .insert(bill)
    .values([
      { ...tenant, customerId: org.customerId, openedBy: org.staff.owner },
      { ...tenant, openedBy: org.staff.owner },
      { ...tenant, customerId: org.customerId, openedBy: org.staff.owner, status: "paid", closedAt: TEST_NOW },
    ])
    .returning();
  const [foreignBill] = await env.db
    .insert(bill)
    .values({ organizationId: foreign.orgId, branchId: foreign.branchId, customerId: foreign.customerId, openedBy: foreign.staff.owner })
    .returning();
  const [mochi, lucky] = await env.db
    .insert(pet)
    .values([
      { ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" },
      { ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Lucky", species: "dog" },
    ])
    .returning();
  const [bath] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [single, household, retired] = await env.db
    .insert(packageTemplate)
    .values([
      { ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: bath?.id ?? "", sessionsCount: 5, priceSatang: 200_000 },
      { ...tenant, nameTh: "อาบบ้าน 10 ครั้ง", serviceId: bath?.id ?? "", sessionsCount: 10, priceSatang: 350_000, shareScope: "household" },
      { ...tenant, nameTh: "เลิกขาย", serviceId: bath?.id ?? "", sessionsCount: 5, priceSatang: 100_000, status: "archived" },
    ])
    .returning();
  const pkg = (extra: Partial<typeof customerPackage.$inferInsert>) => ({
    organizationId: org.orgId,
    customerId: org.customerId,
    templateId: single?.id ?? "",
    petId: mochi?.id ?? "",
    sessionsTotal: 5,
    sessionsUsed: 4,
    unitValueSatang: 40_000,
    purchasedBillId: paid?.id ?? "",
    expiresAt: later,
    ...extra,
  });
  const [lastSession, exhausted, expired] = await env.db
    .insert(customerPackage)
    .values([
      pkg({}),
      pkg({ sessionsUsed: 5, status: "exhausted" }),
      pkg({ sessionsUsed: 1, expiresAt: new Date(TEST_NOW.getTime() - 1) }),
    ])
    .returning();
  const [foreignPet] = await env.db
    .insert(pet)
    .values({ ownerProfileId: foreign.ownerProfileId, createdInOrgId: foreign.orgId, name: "Other", species: "cat" })
    .returning();
  Object.assign(ids, {
    open: open?.id,
    walkIn: walkIn?.id,
    paid: paid?.id,
    foreignBill: foreignBill?.id,
    mochi: mochi?.id,
    lucky: lucky?.id,
    foreignPet: foreignPet?.id,
    single: single?.id,
    household: household?.id,
    retired: retired?.id,
    lastSession: lastSession?.id,
    exhausted: exhausted?.id,
    expired: expired?.id,
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

const add = (body: Partial<BillsAddLineRequest>, billId = ids.open ?? "", role: "owner" | "front_desk" | "staff" = "front_desk") =>
  billsAddLine(staffCtx(env.base, role), { ...(BillsAddLineRequest.parse(body) as BillsAddLineRequest), billId });
const linesOf = async (billId: string) =>
  env.db.select().from(billLine).where(eq(billLine.billId, billId)).orderBy(asc(billLine.sortOrder));

async function post(billId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/bills/${billId}/lines`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ billId }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("adds a quick item over HTTP and recomputes the bill totals (BillDetail)", async () => {
  const response = await post(ids.open ?? "", {
    lineType: "quick_item",
    description: "แชมพูขวดเล็ก",
    quantity: 3,
    unitPriceSatang: 12_000,
    performerId: env.base.staff.staff,
  });
  expect(response.status).toBe(200);
  const detail = BillsAddLineResponse.parse(await response.json());
  expect(detail.lines).toEqual([
    {
      id: expect.any(String),
      lineType: "quick_item",
      description: "แชมพูขวดเล็ก",
      petName: null,
      quantity: 3,
      unitPriceSatang: 12_000,
      lineDiscountSatang: 0,
      lineDiscountReason: null,
      lineTotalSatang: 36_000,
      performerId: env.base.staff.staff,
    },
  ]);
  expect(detail).toMatchObject({ subtotalSatang: 36_000, totalSatang: 36_000, dueSatang: 36_000 });
  expect(await linesOf(ids.open ?? "")).toMatchObject([{ sortOrder: 0, refType: null, refId: null, petId: null }]);
});

it("sells a package to the bill's customer as a package_sale line referencing the template", async () => {
  const detail = await add({ lineType: "package_sale", packageTemplateId: ids.single, petId: ids.mochi });
  expect(detail.lines.at(-1)).toMatchObject({
    lineType: "package_sale",
    description: "อาบ 5 ครั้ง",
    petName: "Mochi",
    quantity: 1,
    unitPriceSatang: 200_000,
    lineTotalSatang: 200_000,
  });
  expect(detail.subtotalSatang).toBe(236_000);
  expect((await linesOf(ids.open ?? "")).at(-1)).toMatchObject({ sortOrder: 1, refType: "package_template", refId: ids.single });
  // household packages need no pet
  expect((await add({ lineType: "package_sale", packageTemplateId: ids.household })).lines.at(-1)).toMatchObject({ petName: null });
});

it("redeems a package for a zero-price line, records package_redemption and exhausts the last session", async () => {
  const detail = await add({ lineType: "package_redemption", customerPackageId: ids.lastSession, petId: ids.mochi, performerId: env.base.staff.staff });
  expect(detail.lines.at(-1)).toMatchObject({ lineType: "package_redemption", description: "อาบ 5 ครั้ง", unitPriceSatang: 0, lineTotalSatang: 0, petName: "Mochi" });
  const row = (await linesOf(ids.open ?? "")).at(-1);
  expect(row).toMatchObject({ refType: "customer_package", refId: ids.lastSession });
  expect(await env.db.select().from(packageRedemption).where(eq(packageRedemption.billLineId, row?.id ?? ""))).toMatchObject([
    { customerPackageId: ids.lastSession, petId: ids.mochi, performerId: env.base.staff.staff, redeemedAt: TEST_NOW, reversedAt: null },
  ]);
  expect((await env.db.select().from(customerPackage).where(eq(customerPackage.id, ids.lastSession ?? "")))[0]).toMatchObject({
    sessionsUsed: 5,
    status: "exhausted",
  });
});

it("reports PACKAGE_EXHAUSTED, PACKAGE_EXPIRED and PACKAGE_PET_MISMATCH", async () => {
  await expect(add({ lineType: "package_redemption", customerPackageId: ids.exhausted, petId: ids.mochi })).rejects.toMatchObject({
    code: "PACKAGE_EXHAUSTED",
  });
  await expect(add({ lineType: "package_redemption", customerPackageId: ids.expired, petId: ids.mochi })).rejects.toMatchObject({
    code: "PACKAGE_EXPIRED",
  });
  await expect(add({ lineType: "package_redemption", customerPackageId: ids.expired, petId: ids.lucky })).rejects.toMatchObject({
    code: "PACKAGE_EXPIRED",
  });
  const [fresh] = await env.db
    .update(customerPackage)
    .set({ expiresAt: later })
    .where(eq(customerPackage.id, ids.expired ?? ""))
    .returning();
  await expect(add({ lineType: "package_redemption", customerPackageId: fresh?.id, petId: ids.lucky })).rejects.toMatchObject({
    code: "PACKAGE_PET_MISMATCH",
  });
});

it("refuses a bill that is not open with BILL_NOT_OPEN", async () => {
  await expect(add({ lineType: "quick_item", description: "x", unitPriceSatang: 100 }, ids.paid)).rejects.toMatchObject({
    code: "BILL_NOT_OPEN",
  });
});

it("rejects missing/irrelevant fields, packages on a walk-in bill and inactive performers with VALIDATION_FAILED", async () => {
  for (const body of [
    {},
    { lineType: "quick_item", unitPriceSatang: 100 },
    { lineType: "quick_item", description: "x" },
    { lineType: "quick_item", description: "x", unitPriceSatang: 100, quantity: 1000 },
    { lineType: "quick_item", description: "x".repeat(81), unitPriceSatang: 100 },
    { lineType: "quick_item", description: "x", unitPriceSatang: -1 },
    { lineType: "quick_item", description: "x", unitPriceSatang: 100, packageTemplateId: ids.single },
    { lineType: "package_sale" },
    { lineType: "package_sale", packageTemplateId: ids.single, quantity: 2 },
    { lineType: "package_redemption", customerPackageId: ids.lastSession },
  ]) {
    const response = await post(ids.open ?? "", body);
    expect(response.status, JSON.stringify(body)).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  const failing: Partial<BillsAddLineRequest>[] = [
    { lineType: "package_sale", packageTemplateId: ids.single },
    { lineType: "package_sale", packageTemplateId: ids.retired, petId: ids.mochi },
  ];
  for (const body of failing) await expect(add(body), JSON.stringify(body)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await expect(add({ lineType: "package_sale", packageTemplateId: ids.household }, ids.walkIn)).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  const [gone] = await env.db
    .insert(staffUser)
    .values({ organizationId: env.base.orgId, displayName: "gone", role: "staff", status: "disabled" })
    .returning();
  await expect(add({ lineType: "quick_item", description: "x", unitPriceSatang: 100, performerId: gone?.id })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
});

it("forbids role staff", async () => {
  const response = await post(ids.open ?? "", { lineType: "quick_item", description: "x", unitPriceSatang: 100 }, "staff");
  expect(response.status).toBe(403);
  expect(await code(response)).toBe("FORBIDDEN");
});

it("answers NOT_FOUND for another organization's bill, package or pet", async () => {
  const response = await post(ids.foreignBill ?? "", { lineType: "quick_item", description: "x", unitPriceSatang: 100 });
  expect(response.status).toBe(404);
  expect(await code(response)).toBe("NOT_FOUND");
  const [foreignPkg] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: foreign.orgId,
      customerId: foreign.customerId,
      templateId: ids.single ?? "",
      sessionsTotal: 5,
      unitValueSatang: 1,
      purchasedBillId: ids.foreignBill ?? "",
      expiresAt: later,
    })
    .returning();
  await expect(add({ lineType: "package_redemption", customerPackageId: foreignPkg?.id, petId: ids.mochi })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(add({ lineType: "package_sale", packageTemplateId: ids.single, petId: ids.foreignPet })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
