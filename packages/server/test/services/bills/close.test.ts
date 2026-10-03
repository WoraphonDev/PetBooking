import { BillsCloseParams, BillsCloseRequest, BillsCloseResponse } from "@app/contracts/endpoints/bills.close";
import {
  auditLog,
  bill,
  billLine,
  booking,
  bookingEvent,
  branch,
  commissionEntry,
  commissionRule,
  creditLedger,
  customer,
  customerPackage,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  notification,
  packageTemplate,
  payment,
  pet,
  roomType,
  roomUnit,
  service,
  stay,
} from "@app/db/schema";
import { packageTerms } from "@app/domain/package/package";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { billsClose } from "../../../src/services/bills/close.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("bills.close", { body: BillsCloseRequest, params: BillsCloseParams }, billsClose);
let env: TestEnv;
let foreign: SeedOrg;
let s: Awaited<ReturnType<typeof seed>>;

/**
 * Open bill of a confirmed booking (deposit 300 verified, 200 applied): picked-up groom bath 500 by the groomer,
 * quick item 100, package sale 2,000 (5 sessions, single pet), counter redemption of a 400/session package by the groomer;
 * cash covers the rest. Commission rule: every service, every staff, 10%.
 */
async function seed(org: SeedOrg) {
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
  const [old] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner, status: "paid" })
    .returning();
  const [held] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: org.orgId,
      customerId: org.customerId,
      templateId: tpl?.id ?? "",
      petId: mochi?.id,
      sessionsTotal: 5,
      sessionsUsed: 2,
      unitValueSatang: 40_000,
      purchasedBillId: old?.id ?? "",
      expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    })
    .returning();
  const [b] = await env.db
    .insert(bill)
    .values({
      ...tenant,
      customerId: org.customerId,
      openedBy: org.staff.owner,
      subtotalSatang: 260_000,
      totalSatang: 260_000,
      paidSatang: 260_000,
    })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B-${b?.id}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      depositRequiredSatang: 30_000,
      depositStatus: "verified",
      depositVerifiedSatang: 30_000,
      billId: b?.id,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T-${b?.id}` })
    .returning();
  const [appt] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: mochi?.id ?? "",
      groomerId: org.staff.staff,
      stationId: st?.id ?? "",
      startsAt: TEST_NOW,
      endsAt: new Date(TEST_NOW.getTime() + 3_600_000),
      blockedUntil: new Date(TEST_NOW.getTime() + 3_600_000),
      status: "picked_up",
    })
    .returning();
  const [item] = await env.db
    .insert(groomAppointmentItem)
    .values({
      organizationId: org.orgId,
      appointmentId: appt?.id ?? "",
      serviceId: bath?.id ?? "",
      nameSnapshot: "อาบน้ำ",
      priceSatang: 50_000,
      durationMinutes: 60,
    })
    .returning();
  const line = { organizationId: org.orgId, billId: b?.id ?? "" };
  const lines = await env.db
    .insert(billLine)
    .values([
      {
        ...line,
        lineType: "groom_service",
        refType: "groom_appointment_item",
        refId: item?.id,
        petId: mochi?.id,
        performerId: org.staff.staff,
        description: "อาบน้ำ",
        unitPriceSatang: 50_000,
        lineTotalSatang: 50_000,
        sortOrder: 0,
      },
      {
        ...line,
        lineType: "quick_item",
        description: "แชมพู",
        unitPriceSatang: 10_000,
        lineTotalSatang: 10_000,
        performerId: org.staff.front_desk,
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
        sortOrder: 3,
      },
    ])
    .returning();
  await env.db.insert(payment).values([
    { ...tenant, billId: b?.id, bookingId: bk?.id, method: "deposit", amountSatang: 20_000, receivedBy: org.staff.owner },
    { ...tenant, billId: b?.id, method: "cash", amountSatang: 240_000, receivedBy: org.staff.owner },
  ]);
  await env.db.insert(commissionRule).values({ ...tenant, type: "percent", value: 1_000 });
  return { billId: b?.id ?? "", bookingId: bk?.id ?? "", petId: mochi?.id ?? "", templateId: tpl?.id ?? "", heldId: held?.id ?? "", lines };
}

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  s = await seed(env.base);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

const close = (billId: string, expectedPaidSatang: number, role: "owner" | "front_desk" = "front_desk") =>
  billsClose(staffCtx(env.base, role), { billId, expectedPaidSatang });
async function post(billId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/bills/${billId}/close`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ billId }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("closes a fully paid bill with the next receipt number and returns BillDetail", async () => {
  const detail = BillsCloseResponse.parse(await close(s.billId, 260_000));
  expect(detail).toMatchObject({
    status: "paid",
    receiptNo: "R69-00001",
    totalSatang: 260_000,
    paidSatang: 260_000,
    dueSatang: 0,
    closedAt: TEST_NOW.toISOString(),
  });
  expect((await env.db.select().from(branch).where(eq(branch.id, env.base.branchId)))[0]).toMatchObject({
    receiptYearBe: 2569,
    receiptNextSeq: 2,
  });
  expect((await env.db.select().from(bill).where(eq(bill.id, s.billId)))[0]).toMatchObject({
    closedBy: env.base.staff.front_desk,
    closedAt: TEST_NOW,
  });
  expect(
    await env.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "bill.close"), eq(auditLog.entityId, s.billId))),
  ).toMatchObject([{ entityType: "bill", actorType: "staff", after: { status: "paid", receiptNo: "R69-00001", totalSatang: 260_000 } }]);
});

it("writes R-13 commissions for groom and redemption lines with a performer", async () => {
  await close(s.billId, 260_000);
  const entries = await env.db.select().from(commissionEntry).where(eq(commissionEntry.billId, s.billId));
  const byLine = (i: number) => entries.find((e) => e.billLineId === s.lines[i]?.id);
  expect(entries).toHaveLength(2);
  expect(byLine(0)).toMatchObject({
    staffUserId: env.base.staff.staff,
    baseSatang: 50_000,
    amountSatang: 5_000,
    status: "earned",
    earnedAt: TEST_NOW,
  });
  // package_redemption base = the package's unit value (R-13 #3)
  expect(byLine(3)).toMatchObject({ staffUserId: env.base.staff.staff, baseSatang: 40_000, amountSatang: 4_000 });
});

it("creates the sold package (R-14) and leaves redemption counts as added", async () => {
  await close(s.billId, 260_000);
  const sold = (await env.db.select().from(customerPackage).where(eq(customerPackage.purchasedBillId, s.billId)))[0];
  const terms = packageTerms({
    priceSatang: 200_000,
    sessionsCount: 5,
    validityDays: 365,
    purchasedAt: TEST_NOW.toISOString(),
    timezone: "Asia/Bangkok",
  });
  expect(sold).toMatchObject({
    customerId: env.base.customerId,
    templateId: s.templateId,
    petId: s.petId,
    sessionsTotal: 5,
    sessionsUsed: 0,
    unitValueSatang: terms.unitValueSatang,
    expiresAt: new Date(terms.expiresAt),
    purchasedAt: TEST_NOW,
    status: "active",
  });
  expect((await env.db.select().from(customerPackage).where(eq(customerPackage.id, s.heldId)))[0]?.sessionsUsed).toBe(2);
});

it("credits the unused deposit, applies the deposit and closes the finished booking", async () => {
  const [before] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  await close(s.billId, 260_000);
  expect(await env.db.select().from(creditLedger).where(eq(creditLedger.refId, s.bookingId))).toMatchObject([
    { customerId: env.base.customerId, deltaSatang: 10_000, reason: "deposit_credit", refType: "booking", createdAt: TEST_NOW },
  ]);
  const [after] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(after).toMatchObject({
    creditBalanceSatang: (before?.creditBalanceSatang ?? 0) + 10_000,
    visitCount: (before?.visitCount ?? 0) + 1,
    firstVisitAt: TEST_NOW,
    lastVisitAt: TEST_NOW,
    reliabilityLevel: 3,
  });
  expect((await env.db.select().from(booking).where(eq(booking.id, s.bookingId)))[0]).toMatchObject({
    status: "closed",
    depositStatus: "applied",
  });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, s.bookingId));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual(
    expect.arrayContaining([
      ["deposit", "verified", "applied"],
      ["booking", "confirmed", "closed"],
    ]),
  );
});

it("keeps a booking confirmed while a child is still running", async () => {
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: "R1" })
    .returning();
  await env.db.insert(stay).values({
    ...tenant,
    bookingId: s.bookingId,
    petId: s.petId,
    roomTypeId: type?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate: "2026-10-05",
    checkOutDate: "2026-10-07",
    nights: 2,
    nightlyPriceSatang: 0,
    roomTotalSatang: 0,
    status: "checked_in",
  });
  await close(s.billId, 260_000);
  expect((await env.db.select().from(booking).where(eq(booking.id, s.bookingId)))[0]?.status).toBe("confirmed");
});

it("queues customer.receipt as the first receipt of the bill", async () => {
  await close(s.billId, 260_000);
  expect(await env.db.select().from(notification).where(eq(notification.templateKey, "customer.receipt"))).toMatchObject([
    {
      recipientType: "customer",
      recipientId: env.base.customerId,
      branchId: env.base.branchId,
      dedupeKey: `receipt:${s.billId}:1:${env.base.customerId}`,
      payload: { receiptNo: "R69-00001", total: "฿2,600.00", receiptUrl: `https://petbooking.test/liff/shop-a/receipts/${s.billId}` },
      status: "queued",
    },
  ]);
});

it("numbers receipts consecutively per branch", async () => {
  await close(s.billId, 260_000);
  const [walkIn] = await env.db
    .insert(bill)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, openedBy: env.base.staff.owner })
    .returning();
  expect((await close(walkIn?.id ?? "", 0)).receiptNo).toBe("R69-00002");
  // a walk-in bill has no customer to notify
  expect(await env.db.select().from(notification).where(eq(notification.templateKey, "customer.receipt"))).toHaveLength(1);
});

it("reports STALE_BILL, BILL_HAS_DUE and BILL_NOT_OPEN", async () => {
  await expect(close(s.billId, 250_000)).rejects.toMatchObject({ code: "STALE_BILL" });
  await env.db
    .update(payment)
    .set({ status: "voided" })
    .where(and(eq(payment.billId, s.billId), eq(payment.method, "cash")));
  await env.db.update(bill).set({ paidSatang: 20_000 }).where(eq(bill.id, s.billId));
  await expect(close(s.billId, 20_000)).rejects.toMatchObject({ code: "BILL_HAS_DUE" });
  const [paid] = await env.db
    .insert(bill)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, openedBy: env.base.staff.owner, status: "paid" })
    .returning();
  await expect(close(paid?.id ?? "", 0)).rejects.toMatchObject({ code: "BILL_NOT_OPEN" });
  expect((await env.db.select().from(branch).where(eq(branch.id, env.base.branchId)))[0]?.receiptNextSeq).toBe(1);
});

it("rejects malformed input, forbids staff and hides another organization's bill", async () => {
  for (const [id, body] of [
    ["not-a-uuid", { expectedPaidSatang: 0 }],
    [s.billId, {}],
    [s.billId, { expectedPaidSatang: -1 }],
  ] as const) {
    const response = await post(id, body);
    expect(response.status).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  const forbidden = await post(s.billId, { expectedPaidSatang: 260_000 }, "staff");
  expect(forbidden.status).toBe(403);
  expect(await code(forbidden)).toBe("FORBIDDEN");
  const other = await seed(foreign);
  const hidden = await post(other.billId, { expectedPaidSatang: 260_000 });
  expect(hidden.status).toBe(404);
  expect(await code(hidden)).toBe("NOT_FOUND");
  const ok = await post(s.billId, { expectedPaidSatang: 260_000 }, "owner");
  expect(ok.status).toBe(200);
});
