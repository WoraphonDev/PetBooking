import type { BookingsDeclineRequest, BookingsDeclineResponse } from "@app/contracts/endpoints/bookings.decline";
import { booking, branch, daycareVisit, groomAppointment, refund, stay } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { computeCancellation } from "@app/domain/payment/cancellation";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "./get.ts";

type PolicySnapshot = Partial<Record<string, unknown>>;

/**
 * 05#ep-bookings.decline: awaiting_approval → cancelled (reason shown to the customer), its children cancelled (slots
 * released), approval_overdue jobs cancelled. R-07 shop_cancel returns a verified deposit in full: refund row (bank
 * transfer, the shop pays it back) + deposit → refunded (Q-0099). customer.booking_declined names the refund (Q-0099).
 */
export async function bookingsDecline(
  ctx: RequestContext,
  input: BookingsDeclineRequest & { bookingId: string },
): Promise<BookingsDeclineResponse> {
  requireRole(ctx, "bookings.decline");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [bk] = (await db.select(booking, eq(booking.id, input.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    if (bk.status !== "awaiting_approval") throw new AppError("INVALID_TRANSITION");
    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "booking",
      to: "cancelled",
      reason: input.reason,
      extraSet: { cancelledAt: ctx.now, cancelledByType: "staff", cancelReason: input.reason, cancelIsLate: false },
    });
    for (const a of (await db.select(
      groomAppointment,
      and(eq(groomAppointment.bookingId, bk.id), inArray(groomAppointment.status, ["scheduled", "checked_in"])),
    )) as (typeof groomAppointment.$inferSelect)[])
      await transition(tx, ctx, { table: groomAppointment, id: a.id, machine: "groom_appointment", to: "cancelled", reason: input.reason });
    for (const s of (await db.select(stay, and(eq(stay.bookingId, bk.id), eq(stay.status, "reserved")))) as (typeof stay.$inferSelect)[])
      await transition(tx, ctx, { table: stay, id: s.id, machine: "stay", to: "cancelled", reason: input.reason });
    for (const v of (await db.select(
      daycareVisit,
      and(eq(daycareVisit.bookingId, bk.id), eq(daycareVisit.status, "reserved")),
    )) as (typeof daycareVisit.$inferSelect)[])
      await transition(tx, ctx, { table: daycareVisit, id: v.id, machine: "daycare_visit", to: "cancelled", reason: input.reason });
    await cancelJobs(tx, `approval_overdue:${bk.id}:`, ctx);

    let returned = 0;
    if (bk.depositStatus === "verified" && bk.depositVerifiedSatang > 0) {
      const snap = bk.policySnapshot as PolicySnapshot;
      const result = computeCancellation({
        now: ctx.now.toISOString(),
        firstServiceAt: (bk.firstServiceAt ?? ctx.now).toISOString(),
        modules: ["grooming"],
        kind: "shop_cancel",
        depositVerifiedSatang: bk.depositVerifiedSatang,
        policySnapshot: {
          groomingFreeCancelHours: Number(snap.groomingFreeCancelHours ?? 24),
          hotelFreeCancelHours: Number(snap.hotelFreeCancelHours ?? 72),
          daycareFreeCancelHours: Number(snap.daycareFreeCancelHours ?? 24),
          lateCancelForfeitPercent: Number(snap.lateCancelForfeitPercent ?? 100),
          cancelRefundMode: (snap.cancelRefundMode as "refund" | "credit" | "customer_choice" | undefined) ?? "credit",
        },
      });
      returned = result.returnSatang;
      if (returned > 0) {
        await db.insert(refund, {
          bookingId: bk.id,
          customerId: bk.customerId,
          amountSatang: returned,
          mode: "bank_transfer",
          reason: input.reason,
          createdBy: ctx.actor.id as string,
          createdAt: ctx.now,
        });
        await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "refunded", reason: input.reason });
      }
    }

    const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
    await enqueueNotification(
      tx,
      { ...ctx, branchId: bk.branchId, timezone: br?.timezone ?? ctx.timezone },
      {
        key: "customer.booking_declined",
        recipient: { type: "customer", id: bk.customerId },
        payload: {
          bookingNo: bk.bookingNo,
          reason: input.reason,
          refundLine: returned > 0 ? `ร้านจะคืนมัดจำ ${formatTHB({ satang: returned })} เต็มจำนวน` : "",
        },
        dedupeKey: `booking_declined:${bk.id}`,
      },
    );
  });
  return bookingDetail(ctx, getDb(), input.bookingId);
}
