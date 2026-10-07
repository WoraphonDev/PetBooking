// T-0179 liff.cancel: the customer cancels their own booking — R-21 gate, R-07 money, R-09 late count, staff.booking_cancelled.
import { LiffCancelParams, LiffCancelRequest, LiffCancelResponse } from "@app/contracts/endpoints/liff.cancel";
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
} from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffCancel } from "../../../src/services/liff/cancel.ts";
import { seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withCustomer("liff.cancel", { params: LiffCancelParams, body: LiffCancelRequest }, liffCancel);
const call = async (s: Shop, bookingId: string, body: unknown = {}, profileId = s.ownerProfileId) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: profileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${s.slug}/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", cookie: `cid=${encodeURIComponent(token)}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: s.slug, bookingId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const POLICY = { groomingFreeCancelHours: 24, lateCancelForfeitPercent: 50, rescheduleCutoffHours: 24 };

let n = 0;
async function shop() {
  n += 1;
  const s = await seedOrg(env.db, `lc${n}`);
  return { ...s, slug: `shop-lc${n}` };
}
type Shop = Awaited<ReturnType<typeof shop>>;

let k = 0;
/** a booking of the shop's customer with one grooming appointment about `hours` from now (shifted so groomers never overlap) */
async function addBooking(s: Shop, opts: { hours?: number; extra?: Partial<typeof booking.$inferInsert>; apptStatus?: string } = {}) {
  const hours = opts.hours ?? 48;
  k += 1;
  const start = new Date(inHours(hours).getTime() + Math.sign(hours || -1) * k * 61 * 60_000);
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: s.customerId,
      bookingNo: `B-${crypto.randomUUID().slice(0, 8)}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "confirmed",
      policySnapshot: { ...POLICY, cancelRefundMode: "credit" },
      firstServiceAt: start,
      ...opts.extra,
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${crypto.randomUUID().slice(0, 4)}` })
    .returning();
  const [appt] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk.id,
      petId: mochi?.id ?? "",
      groomerId: s.staff.staff,
      groomerPreference: "any",
      stationId: station?.id ?? "",
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      blockedUntil: new Date(start.getTime() + 3_600_000),
      ...(opts.apptStatus ? { status: opts.apptStatus as "scheduled" } : {}),
    })
    .returning();
  return { bk, apptId: appt?.id ?? "" };
}
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const customerRow = async (id: string) => (await env.db.select().from(customer).where(eq(customer.id, id)))[0];

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(() => resetRateLimits());

it("cancels in time: booking + appointment cancelled, verified deposit back as credit, booking_events, MyBookingDetail", async () => {
  const s = await shop();
  const { bk, apptId } = await addBooking(s, {
    extra: { depositRequiredSatang: 10_000, depositVerifiedSatang: 10_000, depositStatus: "verified" },
  });
  const res = await call(s, bk.id, { reason: "ติดธุระ" });
  expect(res.status).toBe(200);
  const body = LiffCancelResponse.parse(await res.json());
  expect(body.booking).toMatchObject({ id: bk.id, status: "cancelled", depositStatus: "credited", canCancel: false });
  expect(await bookingRow(bk.id)).toMatchObject({
    status: "cancelled",
    cancelReason: "ติดธุระ",
    cancelledByType: "customer",
    cancelIsLate: false,
    depositStatus: "credited",
  });
  const [appt] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, apptId));
  expect(appt?.status).toBe("cancelled");
  expect(await env.db.select().from(creditLedger).where(eq(creditLedger.refId, bk.id))).toEqual([
    expect.objectContaining({ customerId: s.customerId, deltaSatang: 10_000, reason: "cancellation_credit", createdBy: null }),
  ]);
  expect(await customerRow(s.customerId)).toMatchObject({ creditBalanceSatang: 10_000, lateCancelCount12m: 0 });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bk.id));
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityType: "booking",
        fromStatus: "confirmed",
        toStatus: "cancelled",
        actorType: "customer",
        reason: "ติดธุระ",
      }),
      expect.objectContaining({ entityType: "groom_appointment", entityId: apptId, toStatus: "cancelled" }),
      expect.objectContaining({ entityType: "deposit", fromStatus: "verified", toStatus: "credited" }),
    ]),
  );
});

it("queues staff.booking_cancelled for active owner + front_desk with the dedupe key; isLate empty when in time", async () => {
  const s = await shop();
  const { bk } = await addBooking(s);
  expect((await call(s, bk.id)).status).toBe(200);
  const notes = await env.db
    .select()
    .from(notification)
    .where(and(eq(notification.templateKey, "staff.booking_cancelled"), eq(notification.organizationId, s.orgId)));
  expect(notes.map((x) => x.recipientId).sort()).toEqual([s.staff.front_desk, s.staff.owner].sort());
  for (const x of notes) {
    expect(x.dedupeKey).toBe(`staff_booking_cancelled:${bk.id}:${x.recipientId}`);
    expect(x.payload).toEqual({ bookingNo: bk.bookingNo, customerName: expect.any(String), isLate: "" });
  }
  expect(await bookingRow(bk.id)).toMatchObject({ cancelReason: null, depositStatus: "not_required" });
});

it("a late cancel: cancel_is_late, R-07 forfeit, customer_choice refund → refund row + audit refund.create, R-09 count", async () => {
  const s = await shop();
  const { bk } = await addBooking(s, {
    hours: 10,
    extra: {
      depositRequiredSatang: 20_000,
      depositVerifiedSatang: 20_000,
      depositStatus: "verified",
      policySnapshot: { ...POLICY, cancelRefundMode: "customer_choice" },
    },
  });
  expect((await call(s, bk.id, { customerChoice: "refund" })).status).toBe(200);
  expect(await bookingRow(bk.id)).toMatchObject({ status: "cancelled", cancelIsLate: true, depositStatus: "refunded" });
  const [r] = await env.db.select().from(refund).where(eq(refund.bookingId, bk.id));
  expect(r).toMatchObject({ amountSatang: 10_000, mode: "bank_transfer", customerId: s.customerId, createdBy: s.staff.owner });
  const [audit] = await env.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityId, r?.id ?? ""));
  expect(audit).toMatchObject({ action: "refund.create", actorType: "customer", after: expect.objectContaining({ bookingId: bk.id }) });
  expect(await customerRow(s.customerId)).toMatchObject({ lateCancelCount12m: 1 });
  const [note] = await env.db
    .select()
    .from(notification)
    .where(and(eq(notification.templateKey, "staff.booking_cancelled"), eq(notification.recipientId, s.staff.owner)));
  expect(note?.payload).toMatchObject({ isLate: "(ยกเลิกกระชั้น)" });
});

it("STATUS_NOT_ALLOWED when R-21 says no (status, service time passed) or a pet is already being served", async () => {
  const s = await shop();
  const closed = await addBooking(s, { extra: { status: "closed" } });
  const cancelled = await addBooking(s, { extra: { status: "cancelled" } });
  const started = await addBooking(s, { hours: -1 });
  const serving = await addBooking(s, { apptStatus: "in_progress" });
  for (const { bk } of [closed, cancelled, started, serving]) {
    const res = await call(s, bk.id);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("STATUS_NOT_ALLOWED");
  }
  expect((await bookingRow(serving.bk.id))?.status).toBe("confirmed");
  expect(await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, serving.bk.id))).toEqual([]);
});

it("VALIDATION_FAILED for a bad customerChoice, an unknown field or a malformed id", async () => {
  const s = await shop();
  const { bk } = await addBooking(s);
  for (const body of [{ customerChoice: "cash" }, { reason: 5 }, { kind: "shop_cancel" }]) {
    const res = await call(s, bk.id, body);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("VALIDATION_FAILED");
  }
  expect(await errorCode(await call(s, "not-a-uuid"))).toBe("VALIDATION_FAILED");
  expect((await bookingRow(bk.id))?.status).toBe("confirmed");
});

it("NOT_FOUND for another customer's booking, another shop's booking or an unknown id", async () => {
  const s = await shop();
  const other = await shop();
  const theirs = await addBooking(other);
  // a second customer of the same shop
  const [stranger] = await env.db
    .insert(customer)
    .values({ organizationId: s.orgId, ownerProfileId: other.ownerProfileId, sourceChannel: "walk_in" })
    .returning();
  const strangers = await addBooking(s, { extra: { customerId: stranger?.id ?? "" } });
  for (const id of [strangers.bk.id, theirs.bk.id, "00000000-0000-4000-8000-000000000000"]) {
    const res = await call(s, id);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("NOT_FOUND");
  }
  expect((await bookingRow(strangers.bk.id))?.status).toBe("confirmed");
  expect((await bookingRow(theirs.bk.id))?.status).toBe("confirmed");
});
