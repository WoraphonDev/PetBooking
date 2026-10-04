import { BillsAddPaymentParams, BillsAddPaymentRequest, BillsAddPaymentResponse } from "@app/contracts/endpoints/bills.addPayment";
import { auditLog, bill, creditLedger, customer, fileObject, payment } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { billsAddPayment } from "../../../src/services/bills/addPayment.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bills.addPayment", { body: BillsAddPaymentRequest, params: BillsAddPaymentParams }, billsAddPayment);
let env: TestEnv;
let foreign: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  storage = createFakeStorage();
  setStorage(storage);
  await env.db.update(customer).set({ creditBalanceSatang: 20_000 }).where(eq(customer.id, env.base.customerId));
  resetRateLimits();
});

/** open bill: total 500 บาท, nothing paid yet */
async function seedBill(values: Partial<typeof bill.$inferInsert> = {}, org: SeedOrg = env.base) {
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      openedBy: org.staff.owner,
      subtotalSatang: 50_000,
      totalSatang: 50_000,
      ...values,
    })
    .returning();
  return b?.id ?? "";
}
async function post(billId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bills/${billId}/payments`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { billId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const billRow = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];
const paymentsOf = (id: string) => env.db.select().from(payment).where(eq(payment.billId, id));

it("cash: amount = min(tendered, due), change recorded, bill paid updated, audit payment.create", async () => {
  const billId = await seedBill();
  const res = await post(billId, { method: "cash", tenderedSatang: 100_000, expectedPaidSatang: 0 });
  expect(res.status).toBe(200);
  const detail = BillsAddPaymentResponse.parse(await res.json());
  const [p] = await paymentsOf(billId);
  expect(p).toMatchObject({
    branchId: env.base.branchId,
    method: "cash",
    amountSatang: 50_000,
    tenderedSatang: 100_000,
    reference: null,
    slipId: null,
    proofFileId: null,
    receivedBy: env.base.staff.front_desk,
    status: "posted",
  });
  expect(await billRow(billId)).toMatchObject({ paidSatang: 50_000, changeSatang: 50_000, status: "open" });
  expect(detail.id).toBe(billId);
  const [audit] = await env.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityId, p?.id ?? ""));
  expect(audit).toMatchObject({
    action: "payment.create",
    entityType: "payment",
    after: { method: "cash", amountSatang: 50_000, tenderedSatang: 100_000, changeSatang: 50_000, billId },
  });
});

it("partial payments add up and the next one must see the new paid amount", async () => {
  const billId = await seedBill();
  expect((await post(billId, { method: "cash", tenderedSatang: 20_000, expectedPaidSatang: 0 })).status).toBe(200);
  expect((await post(billId, { method: "card_edc", amountSatang: 10_000, reference: "EDC-0042", expectedPaidSatang: 20_000 })).status).toBe(
    200,
  );
  expect(await billRow(billId)).toMatchObject({ paidSatang: 30_000, changeSatang: 0 });
  const card = (await paymentsOf(billId)).find((p) => p.method === "card_edc");
  expect(card).toMatchObject({ amountSatang: 10_000, tenderedSatang: null, reference: "EDC-0042" });
});

it("STALE_BILL when expectedPaidSatang differs from the locked bill", async () => {
  const billId = await seedBill({ paidSatang: 10_000 });
  expect(await codeOf(await post(billId, { method: "bank_transfer", amountSatang: 1_000, expectedPaidSatang: 0 }))).toBe("STALE_BILL");
  expect(await paymentsOf(billId)).toEqual([]);
});

it("BILL_NOT_OPEN for a paid or void bill", async () => {
  for (const status of ["paid", "void"] as const) {
    const billId = await seedBill({ status, paidSatang: 50_000 });
    expect(await codeOf(await post(billId, { method: "cash", tenderedSatang: 1_000, expectedPaidSatang: 50_000 }))).toBe("BILL_NOT_OPEN");
  }
});

it("AMOUNT_EXCEEDS_DUE when a non-cash amount is above due", async () => {
  const billId = await seedBill({ paidSatang: 30_000 });
  expect(await codeOf(await post(billId, { method: "promptpay", amountSatang: 20_001, expectedPaidSatang: 30_000 }))).toBe(
    "AMOUNT_EXCEEDS_DUE",
  );
});

it("INVALID_AMOUNT for a zero amount", async () => {
  const billId = await seedBill();
  expect(await codeOf(await post(billId, { method: "bank_transfer", amountSatang: 0, expectedPaidSatang: 0 }))).toBe("INVALID_AMOUNT");
});

it("credit: spends the customer's balance with credit_ledger bill_payment (−)", async () => {
  const billId = await seedBill();
  const res = await post(billId, { method: "credit", amountSatang: 15_000, expectedPaidSatang: 0 });
  expect(res.status).toBe(200);
  const [entry] = await env.db.select().from(creditLedger).where(eq(creditLedger.refId, billId));
  expect(entry).toMatchObject({ customerId: env.base.customerId, deltaSatang: -15_000, reason: "bill_payment", refType: "bill" });
  const [c] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(c?.creditBalanceSatang).toBe(5_000);
  expect(await billRow(billId)).toMatchObject({ paidSatang: 15_000 });
});

it("INSUFFICIENT_CREDIT above the balance, or on a walk-in bill without a customer", async () => {
  const billId = await seedBill();
  expect(await codeOf(await post(billId, { method: "credit", amountSatang: 20_001, expectedPaidSatang: 0 }))).toBe("INSUFFICIENT_CREDIT");
  const walkIn = await seedBill({ customerId: null });
  expect(await codeOf(await post(walkIn, { method: "credit", amountSatang: 100, expectedPaidSatang: 0 }))).toBe("INSUFFICIENT_CREDIT");
  const [c] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(c?.creditBalanceSatang).toBe(20_000);
});

it("commits a transfer proof file; a missing object → FILE_NOT_UPLOADED", async () => {
  const billId = await seedBill();
  const [file] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "proof",
      storageKey: `org/${env.base.orgId}/proof/2026/10/p${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      uploadedByType: "staff",
    })
    .returning();
  const body = { method: "bank_transfer", amountSatang: 5_000, proofFileId: file?.id, expectedPaidSatang: 0 };
  expect(await codeOf(await post(billId, body))).toBe("FILE_NOT_UPLOADED");
  storage.put(file?.storageKey ?? "", { sizeBytes: 1000, contentType: "image/jpeg" });
  expect((await post(billId, body)).status).toBe(200);
  expect((await paymentsOf(billId))[0]?.proofFileId).toBe(file?.id);
});

it.each([
  ["cash without tendered", { method: "cash", expectedPaidSatang: 0 }],
  ["transfer without amount", { method: "bank_transfer", expectedPaidSatang: 0 }],
  ["deposit is not accepted here", { method: "deposit", amountSatang: 100, expectedPaidSatang: 0 }],
  ["missing expectedPaidSatang", { method: "cash", tenderedSatang: 100 }],
  ["fractional satang", { method: "bank_transfer", amountSatang: 10.5, expectedPaidSatang: 0 }],
])("VALIDATION_FAILED: %s", async (_name, body) => {
  const billId = await seedBill();
  expect(await codeOf(await post(billId, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN", async () => {
  const billId = await seedBill();
  expect(await codeOf(await post(billId, { method: "cash", tenderedSatang: 100, expectedPaidSatang: 0 }, "staff"))).toBe("FORBIDDEN");
});

it("another org's bill → NOT_FOUND and its paid amount is unchanged", async () => {
  const billId = await seedBill({}, foreign);
  expect(await codeOf(await post(billId, { method: "cash", tenderedSatang: 100, expectedPaidSatang: 0 }))).toBe("NOT_FOUND");
  expect((await billRow(billId))?.paidSatang).toBe(0);
});
