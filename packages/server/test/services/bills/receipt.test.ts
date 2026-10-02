import { BillsReceiptRequest, BillsReceiptResponse } from "@app/contracts/endpoints/bills.receipt";
import { bill, billLine, branch, customerPackage, packageTemplate, payment, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { billsReceipt } from "../../../src/services/bills/receipt.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("bills.receipt", { params: BillsReceiptRequest }, billsReceipt);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

async function seedBill(org: SeedOrg, extra: Partial<typeof bill.$inferInsert> = {}) {
  const [b] = await env.db
    .insert(bill)
    .values({ organizationId: org.orgId, branchId: org.branchId, openedBy: org.staff.front_desk, ...extra })
    .returning();
  return b?.id ?? "";
}

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  await env.db
    .update(branch)
    .set({ phone: "021234567", addressLine: "99/1 ถ.สุขุมวิท", district: "วัฒนา", province: "กรุงเทพมหานคร", postalCode: "10110" })
    .where(eq(branch.id, org.branchId));
  ids.paid = await seedBill(org, {
    customerId: org.customerId,
    status: "paid",
    receiptNo: "R6910-0007",
    subtotalSatang: 90_000,
    billDiscountSatang: 10_000,
    totalSatang: 80_000,
    paidSatang: 80_000,
    changeSatang: 20_000,
    closedBy: org.staff.owner,
    closedAt: new Date("2026-10-05T04:00:00.000Z"),
  });
  await env.db.insert(billLine).values([
    {
      organizationId: org.orgId,
      billId: ids.paid,
      lineType: "groom_addon",
      description: "ตัดเล็บ",
      unitPriceSatang: 10_000,
      lineTotalSatang: 10_000,
      sortOrder: 2,
    },
    {
      organizationId: org.orgId,
      billId: ids.paid,
      lineType: "groom_service",
      description: "อาบน้ำ",
      quantity: 2,
      unitPriceSatang: 45_000,
      lineDiscountSatang: 10_000,
      lineTotalSatang: 80_000,
      sortOrder: 1,
    },
  ]);
  await env.db.insert(payment).values([
    { ...tenant, billId: ids.paid, method: "cash", amountSatang: 50_000, receivedAt: new Date("2026-10-05T03:50:00.000Z") },
    { ...tenant, billId: ids.paid, method: "promptpay", amountSatang: 30_000, receivedAt: new Date("2026-10-05T03:55:00.000Z") },
    { ...tenant, billId: ids.paid, method: "card_edc", amountSatang: 30_000, status: "voided" },
  ]);
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: svc?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const pkg = (extra: Partial<typeof customerPackage.$inferInsert>) => ({
    organizationId: org.orgId,
    customerId: org.customerId,
    templateId: tpl?.id ?? "",
    sessionsTotal: 5,
    unitValueSatang: 40_000,
    purchasedBillId: ids.paid ?? "",
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    ...extra,
  });
  const [active] = await env.db
    .insert(customerPackage)
    .values([pkg({ sessionsUsed: 1 }), pkg({ status: "expired", expiresAt: new Date("2026-01-01T00:00:00.000Z") })])
    .returning();
  ids.package = active?.id ?? "";
  ids.walkIn = await seedBill(org);
  ids.foreign = await seedBill(foreign);
});
afterAll(() => env.close());

async function get(billId: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/bills/${billId}/receipt`, { headers: { cookie: `sid=${login.token}` } }), {
    params: Promise.resolve({ billId }),
  });
}

it("returns the Receipt of a paid bill field by field", async () => {
  const response = await get(ids.paid ?? "");
  expect(response.status).toBe(200);
  const receipt = BillsReceiptResponse.parse(await response.json());
  expect(receipt).toEqual({
    shopName: "Shop a",
    shopAddress: "99/1 ถ.สุขุมวิท วัฒนา กรุงเทพมหานคร 10110",
    shopPhone: "021234567",
    logoUrl: null,
    receiptNo: "R6910-0007",
    closedAt: "2026-10-05T04:00:00.000Z",
    customerName: "Owner a",
    lines: [
      { description: "อาบน้ำ", quantity: 2, unitPriceSatang: 45_000, lineDiscountSatang: 10_000, lineTotalSatang: 80_000 },
      { description: "ตัดเล็บ", quantity: 1, unitPriceSatang: 10_000, lineDiscountSatang: 0, lineTotalSatang: 10_000 },
    ],
    subtotalSatang: 90_000,
    billDiscountSatang: 10_000,
    totalSatang: 80_000,
    payments: [
      { method: "cash", amountSatang: 50_000 },
      { method: "promptpay", amountSatang: 30_000 },
    ],
    changeSatang: 20_000,
    cashierName: "owner",
    status: "paid",
    packagesRemaining: [expect.objectContaining({ id: ids.package, templateName: "อาบ 5 ครั้ง", sessionsLeft: 4, status: "active" })],
  });
});

it("returns an open walk-in bill without receipt number, customer or packages", async () => {
  const receipt = await billsReceipt(staffCtx(env.base, "owner"), { billId: ids.walkIn ?? "" });
  expect(receipt).toMatchObject({
    receiptNo: null,
    closedAt: null,
    customerName: null,
    cashierName: "front_desk",
    status: "open",
    lines: [],
    payments: [],
    packagesRemaining: [],
  });
});

it("rejects a malformed billId with VALIDATION_FAILED", async () => {
  const response = await get("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("forbids role staff", async () => {
  const response = await get(ids.paid ?? "", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers NOT_FOUND for another organization's bill", async () => {
  const response = await get(ids.foreign ?? "", "owner");
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
