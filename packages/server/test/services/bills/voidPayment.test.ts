import { BillsVoidPaymentParams, BillsVoidPaymentRequest, BillsVoidPaymentResponse } from "@app/contracts/endpoints/bills.voidPayment";
import {
  auditLog,
  bill,
  billLine,
  creditLedger,
  customer,
  customerPackage,
  packageRedemption,
  packageTemplate,
  payment,
  pet,
  service,
} from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { billsVoidPayment } from "../../../src/services/bills/voidPayment.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bills.voidPayment", { body: BillsVoidPaymentRequest, params: BillsVoidPaymentParams }, billsVoidPayment);
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
    new Request(`https://petbooking.test/api/v1/staff/payments/${id}/void`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ paymentId: id }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const billOf = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];

it("voids a cash payment over HTTP, lowers paid and audits payment.void", async () => {
  const response = await call(s.cashId, { reason: "รับเงินผิด" });
  expect(response.status).toBe(200);
  const detail = BillsVoidPaymentResponse.parse(await response.json());
  expect(detail).toMatchObject({ paidSatang: 5_000, dueSatang: 75_000 });
  expect(detail.payments.find((p) => p.id === s.cashId)?.status).toBe("voided");
  expect((await env.db.select().from(payment).where(eq(payment.id, s.cashId)))[0]).toMatchObject({
    status: "voided",
    voidReason: "รับเงินผิด",
    voidedBy: env.base.staff.front_desk,
  });
  expect(
    await env.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "payment.void"), eq(auditLog.entityId, s.cashId))),
  ).toMatchObject([{ entityType: "payment", reason: "รับเงินผิด", after: { status: "voided", method: "cash", amountSatang: 10_000 } }]);
});

it("returns a voided credit payment to the customer's credit (credit_ledger void_reversal)", async () => {
  const [before] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  await billsVoidPayment(staffCtx(env.base, "owner"), { paymentId: s.creditId, reason: "ใช้เครดิตผิด" });
  const ledger = await env.db.select().from(creditLedger).where(eq(creditLedger.refId, s.billId));
  expect(ledger).toMatchObject([
    { customerId: env.base.customerId, deltaSatang: 5_000, reason: "void_reversal", refType: "bill", createdAt: TEST_NOW },
  ]);
  const [after] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(after?.creditBalanceSatang).toBe((before?.creditBalanceSatang ?? 0) + 5_000);
  expect((await billOf(s.billId))?.paidSatang).toBe(10_000);
});

it("reports REASON_REQUIRED and BILL_NOT_OPEN, and refuses a payment voided twice", async () => {
  const owner = staffCtx(env.base, "owner");
  await expect(billsVoidPayment(owner, { paymentId: s.cashId })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  await expect(billsVoidPayment(owner, { paymentId: s.cashId, reason: "ab" })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  const paid = await seedBill(env.base, "paid");
  await expect(billsVoidPayment(owner, { paymentId: paid.cashId, reason: "ปิดแล้ว" })).rejects.toMatchObject({ code: "BILL_NOT_OPEN" });
  await billsVoidPayment(owner, { paymentId: s.cashId, reason: "ครั้งแรก" });
  await expect(billsVoidPayment(owner, { paymentId: s.cashId, reason: "ครั้งสอง" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
});

it("rejects malformed input, forbids staff and hides another organization's payment", async () => {
  for (const [id, body] of [
    ["not-a-uuid", { reason: "ผิดรูปแบบ" }],
    [s.cashId, { reason: 123 }],
  ] as const) {
    const response = await call(id, body);
    expect(response.status).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  const forbidden = await call(s.cashId, { reason: "ไม่มีสิทธิ์" }, "staff");
  expect(forbidden.status).toBe(403);
  expect(await code(forbidden)).toBe("FORBIDDEN");
  const other = await seedBill(foreign);
  const hidden = await call(other.cashId, { reason: "ร้านอื่น" });
  expect(hidden.status).toBe(404);
  expect(await code(hidden)).toBe("NOT_FOUND");
});
