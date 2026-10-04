import { BookingsCancelParams, BookingsCancelRequest, BookingsCancelResponse } from "@app/contracts/endpoints/bookings.cancel";
import {
  auditLog,
  booking,
  bookingEvent,
  creditLedger,
  customer,
  groomAppointment,
  groomStation,
  notification,
  pet,
  refund,
  scheduledJob,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsCancel } from "../../../src/services/bookings/cancel.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bookings.cancel", { body: BookingsCancelRequest, params: BookingsCancelParams }, bookingsCancel);
const HOUR = 3_600_000;
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db
    .update(customer)
    .set({ creditBalanceSatang: 0, lateCancelCount12m: 0, noShowCount12m: 0, reliabilityLevel: 3 })
    .where(eq(customer.id, env.base.customerId));
});

/** a booking with one appointment `hoursAhead` of the real clock; snapshot: 24 h free, 50 % forfeit, given refund mode */
async function seedBooking(
  opts: {
    hoursAhead?: number;
    deposit?: number;
    status?: typeof booking.$inferInsert.status;
    apptStatus?: typeof groomAppointment.$inferInsert.status;
    mode?: string;
  } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const startsAt = new Date(Date.now() + (opts.hoursAhead ?? 72) * HOUR + ++seq * 60_000);
  const deposit = opts.deposit ?? 0;
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${String(seq).padStart(4, "0")}`,
      channel: "walk_in",
      createdByType: "staff",
      status: opts.status ?? "confirmed",
      depositRequiredSatang: deposit,
      depositVerifiedSatang: deposit,
      depositStatus: deposit > 0 ? "verified" : "not_required",
      policySnapshot: { groomingFreeCancelHours: 24, lateCancelForfeitPercent: 50, cancelRefundMode: opts.mode ?? "credit" },
      firstServiceAt: startsAt,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const [g] = await env.db
    .insert(staffUser)
    .values({
      organizationId: org.orgId,
      email: `g${seq}@${org.orgId}.test`,
      displayName: `ช่าง ${seq}`,
      role: "staff",
      status: "active",
      isGroomer: true,
    })
    .returning();
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: g?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      blockedUntil: new Date(startsAt.getTime() + HOUR),
      status: opts.apptStatus ?? "scheduled",
    })
    .returning();
  await env.db.insert(scheduledJob).values({
    organizationId: org.orgId,
    jobType: "reminder_24h",
    runAt: new Date(startsAt.getTime() - 24 * HOUR),
    payload: { bookingId: bk?.id, entityType: "groom_appointment", entityId: a?.id },
    dedupeKey: `reminder_24h:${a?.id}:${startsAt.toISOString()}`,
  });
  return { id: bk?.id ?? "", apptId: a?.id ?? "", bookingNo: bk?.bookingNo ?? "" };
}
async function cancel(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bookings/${id}/cancel`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { bookingId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const customerRow = async () => (await env.db.select().from(customer).where(eq(customer.id, env.base.customerId)))[0];
const noteOf = async (id: string) =>
  (
    await env.db
      .select()
      .from(notification)
      .where(eq(notification.dedupeKey, `booking_cancelled:${id}:${env.base.customerId}`))
  )[0];

it("customer cancel in time with credit mode: all cancelled, deposit credited, jobs cancelled, audit, message", async () => {
  const b = await seedBooking({ deposit: 30_000 });
  const res = await cancel(b.id, { kind: "customer_cancel", reason: "ลูกค้าติดธุระ" });
  expect(res.status).toBe(200);
  const detail = BookingsCancelResponse.parse(await res.json());
  expect(detail).toMatchObject({ status: "cancelled", cancelReason: "ลูกค้าติดธุระ", cancelledByType: "staff", depositStatus: "credited" });
  expect(await bookingRow(b.id)).toMatchObject({ status: "cancelled", cancelIsLate: false });
  expect((await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, b.apptId)))[0]?.status).toBe("cancelled");
  const [ledger] = await env.db.select().from(creditLedger).where(eq(creditLedger.refId, b.id));
  expect(ledger).toMatchObject({ deltaSatang: 30_000, reason: "cancellation_credit", refType: "booking" });
  expect(await customerRow()).toMatchObject({ creditBalanceSatang: 30_000, lateCancelCount12m: 0 });
  const jobs = (await env.db.select().from(scheduledJob)).filter((j) => j.dedupeKey.startsWith(`reminder_24h:${b.apptId}:`));
  expect(jobs.map((j) => j.status)).toEqual(["cancelled"]);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, b.id));
  expect(audit).toMatchObject({
    action: "booking.cancel",
    reason: "ลูกค้าติดธุระ",
    after: { kind: "customer_cancel", isLate: false, returnSatang: 30_000, returnMode: "credit" },
  });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, b.id));
  expect(events.map((e) => [e.entityType, e.toStatus]).sort()).toEqual(
    [
      ["booking", "cancelled"],
      ["deposit", "credited"],
      ["groom_appointment", "cancelled"],
    ].sort(),
  );
  expect((await noteOf(b.id))?.payload).toEqual({ bookingNo: b.bookingNo, reason: "ลูกค้าติดธุระ", moneyLine: "คืนเป็นเครดิต ฿300 ใช้ได้ครั้งหน้า" });
});

it("late customer cancel with refund: half forfeited, refund row, cancel_is_late, late count + R-09", async () => {
  await env.db.update(customer).set({ lateCancelCount12m: 1 }).where(eq(customer.id, env.base.customerId));
  const b = await seedBooking({ deposit: 30_000, hoursAhead: 5, mode: "refund" });
  const detail = BookingsCancelResponse.parse(await (await cancel(b.id, { kind: "customer_cancel", reason: "มาไม่ทัน" })).json());
  expect(detail.depositStatus).toBe("refunded");
  expect(await bookingRow(b.id)).toMatchObject({ cancelIsLate: true });
  const [r] = await env.db.select().from(refund).where(eq(refund.bookingId, b.id));
  expect(r).toMatchObject({ amountSatang: 15_000, mode: "bank_transfer", reason: "มาไม่ทัน" });
  expect(await customerRow()).toMatchObject({ lateCancelCount12m: 2, reliabilityLevel: 2 });
  expect((await noteOf(b.id))?.payload).toMatchObject({ moneyLine: "ริบมัดจำ ฿150 ตามนโยบายร้าน · ร้านจะคืนเงิน ฿150" });
});

it("customer choice overrides customer_choice mode; shop cancel never forfeits and is never late", async () => {
  const a = await seedBooking({ deposit: 20_000, mode: "customer_choice" });
  expect(
    BookingsCancelResponse.parse(
      await (await cancel(a.id, { kind: "customer_cancel", reason: "เปลี่ยนใจ", customerChoice: "refund" })).json(),
    ).depositStatus,
  ).toBe("refunded");
  const b = await seedBooking({ deposit: 20_000, hoursAhead: 2 });
  const detail = BookingsCancelResponse.parse(await (await cancel(b.id, { kind: "shop_cancel", reason: "ช่างป่วย" })).json());
  expect(detail.depositStatus).toBe("refunded");
  expect(await bookingRow(b.id)).toMatchObject({ cancelIsLate: false });
  expect((await customerRow())?.lateCancelCount12m).toBe(0);
});

it("no deposit: nothing to return, empty money line", async () => {
  const b = await seedBooking({ status: "awaiting_approval" });
  expect((await cancel(b.id, { kind: "customer_cancel", reason: "ไม่สะดวก" })).status).toBe(200);
  expect((await noteOf(b.id))?.payload).toMatchObject({ moneyLine: "" });
});

it("a service already started → STATUS_NOT_ALLOWED; a cancelled booking → INVALID_TRANSITION", async () => {
  expect(await codeOf(await cancel((await seedBooking({ apptStatus: "in_progress" })).id, { kind: "shop_cancel", reason: "ทดสอบ" }))).toBe(
    "STATUS_NOT_ALLOWED",
  );
  expect(await codeOf(await cancel((await seedBooking({ status: "cancelled" })).id, { kind: "shop_cancel", reason: "ทดสอบ" }))).toBe(
    "INVALID_TRANSITION",
  );
});

it.each([
  ["missing kind", { reason: "ทดสอบ" }],
  ["no_show is not a cancel kind", { kind: "no_show", reason: "ทดสอบ" }],
  ["reason too short", { kind: "shop_cancel", reason: "ab" }],
  ["unknown choice", { kind: "customer_cancel", reason: "ทดสอบ", customerChoice: "cash" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await cancel((await seedBooking()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await cancel((await seedBooking()).id, { kind: "shop_cancel", reason: "ทดสอบ" }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await cancel((await seedBooking({}, other)).id, { kind: "shop_cancel", reason: "ทดสอบ" }))).toBe("NOT_FOUND");
});
