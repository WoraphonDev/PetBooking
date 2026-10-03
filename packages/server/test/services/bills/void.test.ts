import { BillsVoidParams, BillsVoidRequest, BillsVoidResponse } from "@app/contracts/endpoints/bills.void";
import {
  auditLog,
  bill,
  billLine,
  booking,
  bookingEvent,
  commissionEntry,
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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { billsVoid } from "../../../src/services/bills/void.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("bills.void", { body: BillsVoidRequest, params: BillsVoidParams }, billsVoid);
let env: TestEnv;
let foreign: SeedOrg;
let s: Awaited<ReturnType<typeof seedPaid>>;

/**
 * A bill as bills.close leaves it: paid R69-00001 for a closed booking (deposit 300 verified, 200 applied, 100 credited),
 * a groom line and a counter redemption with earned commissions, a package sold on the bill, payments deposit 200 +
 * credit 50 + cash 2,350; customer credit balance 100.
 */
async function seedPaid(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
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
  const [b] = await env.db
    .insert(bill)
    .values({
      ...tenant,
      customerId: org.customerId,
      openedBy: org.staff.owner,
      receiptNo: "R69-00001",
      status: "paid",
      subtotalSatang: 260_000,
      totalSatang: 260_000,
      paidSatang: 260_000,
      closedAt: TEST_NOW,
      closedBy: org.staff.front_desk,
    })
    .returning();
  const [held] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: org.orgId,
      customerId: org.customerId,
      templateId: tpl?.id ?? "",
      petId: mochi?.id,
      sessionsTotal: 5,
      sessionsUsed: 5,
      status: "exhausted",
      unitValueSatang: 40_000,
      purchasedBillId: b?.id ?? "",
      expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    })
    .returning();
  const [sold] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: org.orgId,
      customerId: org.customerId,
      templateId: tpl?.id ?? "",
      petId: mochi?.id,
      sessionsTotal: 5,
      unitValueSatang: 40_000,
      purchasedBillId: b?.id ?? "",
      expiresAt: new Date("2027-10-05T16:59:59.999Z"),
    })
    .returning();
  // the redeemed package was bought earlier on another bill
  const [older] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner, status: "paid" })
    .returning();
  await env.db
    .update(customerPackage)
    .set({ purchasedBillId: older?.id ?? "" })
    .where(eq(customerPackage.id, held?.id ?? ""));
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B-${b?.id}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "closed",
      policySnapshot: {},
      depositStatus: "applied",
      depositVerifiedSatang: 30_000,
      billId: b?.id,
    })
    .returning();
  const line = { organizationId: org.orgId, billId: b?.id ?? "" };
  const [groom, redemption] = await env.db
    .insert(billLine)
    .values([
      {
        ...line,
        lineType: "groom_service",
        description: "อาบน้ำ",
        unitPriceSatang: 60_000,
        lineTotalSatang: 60_000,
        performerId: org.staff.staff,
        sortOrder: 0,
      },
      {
        ...line,
        lineType: "package_redemption",
        refType: "customer_package",
        refId: held?.id,
        petId: mochi?.id,
        performerId: org.staff.staff,
        description: "อาบ 5 ครั้ง",
        unitPriceSatang: 0,
        lineTotalSatang: 0,
        sortOrder: 1,
      },
      {
        ...line,
        lineType: "package_sale",
        refType: "package_template",
        refId: tpl?.id,
        petId: mochi?.id,
        description: "อาบ 5 ครั้ง",
        unitPriceSatang: 200_000,
        lineTotalSatang: 200_000,
        sortOrder: 2,
      },
    ])
    .returning();
  await env.db.insert(packageRedemption).values({
    organizationId: org.orgId,
    customerPackageId: held?.id ?? "",
    billLineId: redemption?.id ?? "",
    petId: mochi?.id ?? "",
    redeemedAt: TEST_NOW,
  });
  await env.db.insert(commissionEntry).values(
    [groom, redemption].map((l, i) => ({
      ...tenant,
      staffUserId: org.staff.staff,
      billId: b?.id ?? "",
      billLineId: l?.id ?? "",
      baseSatang: i ? 40_000 : 60_000,
      amountSatang: i ? 4_000 : 6_000,
      earnedAt: TEST_NOW,
    })),
  );
  await env.db.insert(payment).values([
    { ...tenant, billId: b?.id, bookingId: bk?.id, method: "deposit", amountSatang: 20_000 },
    { ...tenant, billId: b?.id, method: "credit", amountSatang: 5_000 },
    { ...tenant, billId: b?.id, method: "cash", amountSatang: 235_000 },
  ]);
  await env.db.insert(creditLedger).values({
    organizationId: org.orgId,
    customerId: org.customerId,
    deltaSatang: 10_000,
    reason: "deposit_credit",
    refType: "booking",
    refId: bk?.id,
  });
  await env.db.update(customer).set({ creditBalanceSatang: 10_000 }).where(eq(customer.id, org.customerId));
  return {
    billId: b?.id ?? "",
    bookingId: bk?.id ?? "",
    heldId: held?.id ?? "",
    soldId: sold?.id ?? "",
    redemptionLineId: redemption?.id ?? "",
  };
}

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  s = await seedPaid(env.base);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

const voidBill = (billId: string, reason = "คิดเงินผิด") => billsVoid(staffCtx(env.base, "owner"), { billId, reason });
async function post(billId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/bills/${billId}/void`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ billId }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("voids a paid bill over HTTP, keeps its receipt number and audits bill.void", async () => {
  const response = await post(s.billId, { reason: "คิดเงินผิด" });
  expect(response.status).toBe(200);
  const detail = BillsVoidResponse.parse(await response.json());
  expect(detail).toMatchObject({ status: "void", receiptNo: "R69-00001", voidReason: "คิดเงินผิด", bookingIds: [] });
  expect(detail.payments.every((p) => p.status === "voided")).toBe(true);
  expect((await env.db.select().from(bill).where(eq(bill.id, s.billId)))[0]).toMatchObject({ voidedBy: env.base.staff.owner });
  expect(
    await env.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "bill.void"), eq(auditLog.entityId, s.billId))),
  ).toMatchObject([
    { entityType: "bill", reason: "คิดเงินผิด", before: { status: "paid" }, after: { status: "void", receiptNo: "R69-00001" } },
  ]);
});

it("reverses commissions, returns redeemed sessions and voids packages sold on the bill", async () => {
  await voidBill(s.billId);
  const entries = await env.db.select().from(commissionEntry).where(eq(commissionEntry.billId, s.billId));
  expect(entries.map((e) => [e.status, e.reversedAt])).toEqual([
    ["reversed", TEST_NOW],
    ["reversed", TEST_NOW],
  ]);
  expect(
    (await env.db.select().from(packageRedemption).where(eq(packageRedemption.billLineId, s.redemptionLineId)))[0]?.reversedAt,
  ).toEqual(TEST_NOW);
  expect((await env.db.select().from(customerPackage).where(eq(customerPackage.id, s.heldId)))[0]).toMatchObject({
    sessionsUsed: 4,
    status: "active",
  });
  expect((await env.db.select().from(customerPackage).where(eq(customerPackage.id, s.soldId)))[0]?.status).toBe("void");
});

it("gives back the credit spent and takes back the deposit credit earned (void_reversal)", async () => {
  await voidBill(s.billId);
  const ledger = await env.db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, "void_reversal"), eq(creditLedger.refId, s.billId)));
  expect(ledger.map((l) => l.deltaSatang).sort((a, b) => a - b)).toEqual([-10_000, 5_000]);
  expect((await env.db.select().from(customer).where(eq(customer.id, env.base.customerId)))[0]?.creditBalanceSatang).toBe(5_000);
});

it("returns the booking to confirmed without a bill and makes its deposit available again", async () => {
  await voidBill(s.billId);
  expect((await env.db.select().from(booking).where(eq(booking.id, s.bookingId)))[0]).toMatchObject({
    status: "confirmed",
    depositStatus: "verified",
    billId: null,
  });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, s.bookingId));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.reason])).toEqual(
    expect.arrayContaining([
      ["booking", "closed", "confirmed", "คิดเงินผิด"],
      ["deposit", "applied", "verified", "คิดเงินผิด"],
    ]),
  );
  expect((await env.db.select().from(payment).where(eq(payment.billId, s.billId))).map((p) => p.status)).toEqual([
    "voided",
    "voided",
    "voided",
  ]);
});

it("voids an open bill without payments, refuses one with posted payments and a bill already void", async () => {
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [open, paying] = await env.db
    .insert(bill)
    .values([
      { ...tenant, openedBy: env.base.staff.owner },
      { ...tenant, openedBy: env.base.staff.owner, totalSatang: 100, subtotalSatang: 100, paidSatang: 100 },
    ])
    .returning();
  await env.db.insert(payment).values({ ...tenant, billId: paying?.id, method: "cash", amountSatang: 100 });
  expect(await voidBill(open?.id ?? "")).toMatchObject({ status: "void", receiptNo: null });
  await expect(voidBill(paying?.id ?? "")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await expect(voidBill(open?.id ?? "")).rejects.toMatchObject({ code: "BILL_NOT_OPEN" });
});

it("rejects a missing or short reason, allows only the owner and hides another organization's bill", async () => {
  for (const body of [{}, { reason: "ab" }, { reason: "   " }]) {
    const response = await post(s.billId, body);
    expect(response.status).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  for (const role of ["front_desk", "staff"] as const) {
    const response = await post(s.billId, { reason: "ไม่มีสิทธิ์" }, role);
    expect(response.status).toBe(403);
    expect(await code(response)).toBe("FORBIDDEN");
  }
  const other = await seedPaid(foreign);
  const hidden = await post(other.billId, { reason: "ร้านอื่น" });
  expect(hidden.status).toBe(404);
  expect(await code(hidden)).toBe("NOT_FOUND");
  expect((await env.db.select().from(bill).where(eq(bill.id, s.billId)))[0]?.status).toBe("paid");
});
