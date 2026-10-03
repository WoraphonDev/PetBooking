import { BillsSetDiscountParams, BillsSetDiscountRequest, BillsSetDiscountResponse } from "@app/contracts/endpoints/bills.setDiscount";
import { auditLog, bill, billLine, customerPackage, packageRedemption, packageTemplate, payment, pet, service } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { billsSetDiscount } from "../../../src/services/bills/setDiscount.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bills.setDiscount", { body: BillsSetDiscountRequest, params: BillsSetDiscountParams }, billsSetDiscount);
let env: TestEnv;
let foreign: SeedOrg;
let s: Awaited<ReturnType<typeof seedBill>>;
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  s = await seedBill(env.base);
});

/** open bill of the base customer: quick item 300 + booking groom line 500 + counter package redemption (last session); cash 100 + credit 50 posted */
async function seedBill(org: SeedOrg, status: "open" | "paid" = "open") {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [b] = await env.db
    .insert(bill)
    .values({
      ...tenant,
      customerId: org.customerId,
      openedBy: org.staff.owner,
      subtotalSatang: 80_000,
      totalSatang: 80_000,
      paidSatang: 15_000,
    })
    .returning();
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
    .returning();
  const [bath] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: bath?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const [pkg] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: org.orgId,
      customerId: org.customerId,
      templateId: tpl?.id ?? "",
      petId: mochi?.id ?? "",
      sessionsTotal: 5,
      sessionsUsed: 5,
      status: "exhausted",
      unitValueSatang: 40_000,
      purchasedBillId: b?.id ?? "",
      expiresAt: new Date(TEST_NOW.getTime() + 86_400_000 * 100),
    })
    .returning();
  const line = { organizationId: org.orgId, billId: b?.id ?? "" };
  const [quick, groom, redemption] = await env.db
    .insert(billLine)
    .values([
      { ...line, lineType: "quick_item", description: "แชมพู", unitPriceSatang: 30_000, lineTotalSatang: 30_000, sortOrder: 0 },
      {
        ...line,
        lineType: "groom_service",
        refType: "groom_appointment_item",
        refId: crypto.randomUUID(),
        description: "อาบน้ำ",
        unitPriceSatang: 50_000,
        lineTotalSatang: 50_000,
        sortOrder: 1,
      },
      {
        ...line,
        lineType: "package_redemption",
        refType: "customer_package",
        refId: pkg?.id,
        petId: mochi?.id,
        description: "อาบ 5 ครั้ง",
        unitPriceSatang: 0,
        lineTotalSatang: 0,
        sortOrder: 2,
      },
    ])
    .returning();
  await env.db.insert(packageRedemption).values({
    organizationId: org.orgId,
    customerPackageId: pkg?.id ?? "",
    billLineId: redemption?.id ?? "",
    petId: mochi?.id ?? "",
    redeemedAt: TEST_NOW,
  });
  const [cash, credit] = await env.db
    .insert(payment)
    .values([
      { ...tenant, billId: b?.id, method: "cash", amountSatang: 10_000, receivedBy: org.staff.owner },
      { ...tenant, billId: b?.id, method: "credit", amountSatang: 5_000, receivedBy: org.staff.owner },
    ])
    .returning();
  if (status !== "open")
    await env.db
      .update(bill)
      .set({ status, closedAt: TEST_NOW, paidSatang: 80_000 })
      .where(eq(bill.id, b?.id ?? ""));
  return {
    billId: b?.id ?? "",
    quickId: quick?.id ?? "",
    groomId: groom?.id ?? "",
    redemptionId: redemption?.id ?? "",
    packageId: pkg?.id ?? "",
    cashId: cash?.id ?? "",
    creditId: credit?.id ?? "",
  };
}

async function call(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bills/${id}/discount`, {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ billId: id }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const billOf = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];

it("sets the bill discount with its reason, recomputes the total and audits it in the same transaction", async () => {
  const response = await call(s.billId, { billDiscountSatang: 10_000, reason: "ลูกค้าประจำ" });
  expect(response.status).toBe(200);
  const detail = BillsSetDiscountResponse.parse(await response.json());
  expect(detail).toMatchObject({
    subtotalSatang: 80_000,
    billDiscountSatang: 10_000,
    billDiscountReason: "ลูกค้าประจำ",
    totalSatang: 70_000,
    dueSatang: 55_000,
  });
  expect(await billOf(s.billId)).toMatchObject({ billDiscountSatang: 10_000, billDiscountReason: "ลูกค้าประจำ", totalSatang: 70_000 });
  expect(
    await env.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "bill.discount"), eq(auditLog.entityId, s.billId))),
  ).toMatchObject([
    { entityType: "bill", actorType: "staff", reason: "ลูกค้าประจำ", after: { billDiscountSatang: 10_000, billDiscountReason: "ลูกค้าประจำ" } },
  ]);
  // clearing it needs no reason
  expect(await billsSetDiscount(staffCtx(env.base, "owner"), { billId: s.billId, billDiscountSatang: 0 })).toMatchObject({
    billDiscountSatang: 0,
    billDiscountReason: null,
    totalSatang: 80_000,
  });
});

it("reports BILL_DISCOUNT_TOO_LARGE, DISCOUNT_LIMIT_EXCEEDED (front_desk > 20%) and REASON_REQUIRED", async () => {
  const owner = staffCtx(env.base, "owner");
  await expect(billsSetDiscount(owner, { billId: s.billId, billDiscountSatang: 80_001, reason: "เกิน" })).rejects.toMatchObject({
    code: "BILL_DISCOUNT_TOO_LARGE",
  });
  await expect(
    billsSetDiscount(staffCtx(env.base, "front_desk"), { billId: s.billId, billDiscountSatang: 16_001, reason: "มากไป" }),
  ).rejects.toMatchObject({ code: "DISCOUNT_LIMIT_EXCEEDED" });
  expect(
    await billsSetDiscount(staffCtx(env.base, "front_desk"), { billId: s.billId, billDiscountSatang: 16_000, reason: "พอดี" }),
  ).toMatchObject({ totalSatang: 64_000 });
  // the owner has no limit
  expect(await billsSetDiscount(owner, { billId: s.billId, billDiscountSatang: 50_000, reason: "เจ้าของ" })).toMatchObject({
    totalSatang: 30_000,
  });
  await expect(billsSetDiscount(owner, { billId: s.billId, billDiscountSatang: 100, reason: "ab" })).rejects.toMatchObject({
    code: "REASON_REQUIRED",
  });
  await expect(billsSetDiscount(owner, { billId: s.billId, billDiscountSatang: 100 })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
});

it("refuses a bill that is not open with BILL_NOT_OPEN", async () => {
  const paid = await seedBill(env.base, "paid");
  await expect(billsSetDiscount(staffCtx(env.base, "owner"), { billId: paid.billId, billDiscountSatang: 0 })).rejects.toMatchObject({
    code: "BILL_NOT_OPEN",
  });
});

it("rejects malformed bodies, forbids staff and hides another organization's bill", async () => {
  for (const body of [{}, { billDiscountSatang: -1 }, { billDiscountSatang: 1.5 }]) {
    const response = await call(s.billId, body);
    expect(response.status).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  const forbidden = await call(s.billId, { billDiscountSatang: 0 }, "staff");
  expect(forbidden.status).toBe(403);
  expect(await code(forbidden)).toBe("FORBIDDEN");
  const other = await seedBill(foreign);
  const hidden = await call(other.billId, { billDiscountSatang: 0 });
  expect(hidden.status).toBe(404);
  expect(await code(hidden)).toBe("NOT_FOUND");
});
