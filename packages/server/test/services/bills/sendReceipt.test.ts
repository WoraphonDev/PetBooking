import { BillsSendReceiptRequest } from "@app/contracts/endpoints/bills.sendReceipt";
import { bill, notification } from "@app/db/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { billsSendReceipt } from "../../../src/services/bills/sendReceipt.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("bills.sendReceipt", { params: BillsSendReceiptRequest }, billsSendReceipt);
let env: TestEnv;
let foreign: SeedOrg;
let billId: string;

async function seedBill(org: SeedOrg, extra: Partial<typeof bill.$inferInsert> = {}) {
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      openedBy: org.staff.front_desk,
      status: "paid",
      receiptNo: "R6910-0007",
      subtotalSatang: 123_450,
      totalSatang: 123_450,
      paidSatang: 123_450,
      closedAt: new Date("2026-10-05T04:00:00.000Z"),
      ...extra,
    })
    .returning();
  return b?.id ?? "";
}

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  foreign = await otherOrg(env.db);
  billId = await seedBill(env.base);
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

async function post(id: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/bills/${id}/send-receipt`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: Promise.resolve({ billId: id }) },
  );
}
const outbox = () => env.db.select().from(notification);

it("answers 204 and queues customer.receipt with the receipt payload", async () => {
  const response = await post(billId);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(await outbox()).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      recipientType: "customer",
      recipientId: env.base.customerId,
      templateKey: "customer.receipt",
      payload: { receiptNo: "R6910-0007", total: "฿1,234.50", receiptUrl: `https://petbooking.test/liff/shop-a/receipts/${billId}` },
      dedupeKey: `receipt:${billId}:1:${env.base.customerId}`,
      monthKey: "2026-10",
      status: "queued",
    }),
  ]);
});

it("numbers each re-send in the dedupe key (receipt:{billId}:{n})", async () => {
  await billsSendReceipt(staffCtx(env.base, "owner"), { billId });
  await billsSendReceipt(staffCtx(env.base, "owner"), { billId });
  expect((await outbox()).map((n) => n.dedupeKey).sort()).toEqual([
    `receipt:${billId}:1:${env.base.customerId}`,
    `receipt:${billId}:2:${env.base.customerId}`,
  ]);
});

it("refuses an open (BILL_HAS_DUE) or void (BILL_NOT_OPEN) bill and a bill without customer (NOT_FOUND)", async () => {
  const cases = [
    [await seedBill(env.base, { status: "open", receiptNo: null, paidSatang: 0, closedAt: null }), 409, "BILL_HAS_DUE"],
    [await seedBill(env.base, { status: "void", receiptNo: null, paidSatang: 0 }), 409, "BILL_NOT_OPEN"],
    [await seedBill(env.base, { customerId: null, receiptNo: "R6910-0008" }), 404, "NOT_FOUND"],
  ] as const;
  for (const [id, status, code] of cases) {
    const response = await post(id);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  }
  expect(await outbox()).toEqual([]);
});

it("rejects a malformed billId with VALIDATION_FAILED", async () => {
  const response = await post("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("forbids role staff", async () => {
  const response = await post(billId, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers NOT_FOUND for another organization's bill without queuing", async () => {
  const response = await post(await seedBill(foreign), "owner");
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  expect(await outbox()).toEqual([]);
});
