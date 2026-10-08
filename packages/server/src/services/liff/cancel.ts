import type { LiffCancelRequest, LiffCancelResponse } from "@app/contracts/endpoints/liff.cancel";
import { booking, creditLedger, customer, daycareVisit, groomAppointment, ownerProfile, refund, staffUser, stay } from "@app/db/schema";
import { computeReliability } from "@app/domain/customer/reliability";
import { computeCancellation } from "@app/domain/payment/cancellation";
import * as daycareState from "@app/domain/state/daycare_visit";
import * as groomState from "@app/domain/state/groom_appointment";
import * as stayState from "@app/domain/state/stay";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { liffBooking } from "./booking.ts";
import { requireMyBooking, selfService } from "./bookings.ts";

type Child = { id: string; status: string };
const ENDED = ["cancelled", "no_show"];
type Snapshot = Partial<Record<string, unknown>>;
const children = [
  { table: groomAppointment, machine: "groom_appointment", module: "grooming", canTransition: groomState.canTransition },
  { table: stay, machine: "stay", module: "hotel", canTransition: stayState.canTransition },
  { table: daycareVisit, machine: "daycare_visit", module: "daycare", canTransition: daycareState.canTransition },
] as const;

/**
 * 05#ep-liff.cancel, one transaction (Q-1054). Only the customer's own booking (else NOT_FOUND). R-21 must allow
 * cancelling, and no child may already be in service; otherwise STATUS_NOT_ALLOWED.
 * - booking → cancelled (cancelled_by_type customer, cancel_is_late = R-07 isLate, Q-0084); children → cancelled
 * - R-07 customer_cancel with the booked policy on a verified deposit: credit → credit_ledger cancellation_credit;
 *   refund → a refund row for the shop's transfer, recorded by the first active owner (Q-0068) + audit refund.create
 * - a late cancel → R-09 late count; pending jobs of the booking cancelled
 * - staff.booking_cancelled to active front_desk + owner (isLate text per Q-0088)
 */
export async function liffCancel(ctx: RequestContext, input: LiffCancelRequest & { branchSlug: string; bookingId: string }) {
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const mine = await requireMyBooking(ctx, tx, input.bookingId);
    const [bk] = (await db.select(booking, eq(booking.id, mine.id)).for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    if (!selfService(ctx, bk).canCancel) throw new AppError("STATUS_NOT_ALLOWED", { status: bk.status });

    const kids = [];
    for (const c of children)
      for (const row of (await db.select(c.table, eq(c.table.bookingId, bk.id))) as Child[]) kids.push({ ...c, row });
    const started = kids.find((k) => !ENDED.includes(k.row.status) && !k.canTransition(k.row.status as never, "cancelled"));
    if (started) throw new AppError("STATUS_NOT_ALLOWED", { childId: started.row.id, status: started.row.status });

    // R-07 with the policy as booked (same inputs as bookings.cancel / liff.booking cancelPreview)
    const snap = bk.policySnapshot as Snapshot;
    const result = computeCancellation({
      now: ctx.now.toISOString(),
      firstServiceAt: (bk.firstServiceAt ?? ctx.now).toISOString(),
      modules: [...new Set(kids.map((k) => k.module))],
      kind: "customer_cancel",
      depositVerifiedSatang: bk.depositStatus === "verified" ? bk.depositVerifiedSatang : 0,
      policySnapshot: {
        groomingFreeCancelHours: Number(snap.groomingFreeCancelHours ?? 24),
        hotelFreeCancelHours: Number(snap.hotelFreeCancelHours ?? 72),
        daycareFreeCancelHours: Number(snap.daycareFreeCancelHours ?? 24),
        lateCancelForfeitPercent: Number(snap.lateCancelForfeitPercent ?? 100),
        cancelRefundMode: (snap.cancelRefundMode as "refund" | "credit" | "customer_choice" | undefined) ?? "credit",
      },
      customerChoice: input.customerChoice,
    });
    const reason = input.reason?.trim() || null;

    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "booking",
      to: "cancelled",
      reason,
      extraSet: { cancelledAt: ctx.now, cancelledByType: "customer", cancelReason: reason, cancelIsLate: result.isLate },
    });
    for (const k of kids)
      if (!ENDED.includes(k.row.status))
        await transition(tx, ctx, { table: k.table, id: k.row.id, machine: k.machine, to: "cancelled", reason });

    // money (R-07 note)
    if (bk.depositStatus === "verified" && bk.depositVerifiedSatang > 0) {
      if (result.returnSatang > 0 && result.returnMode === "credit") {
        const [c] = (await db.select(customer, eq(customer.id, bk.customerId)).for("update")) as (typeof customer.$inferSelect)[];
        if (!c) throw new AppError("NOT_FOUND");
        await db.insert(creditLedger, {
          customerId: c.id,
          deltaSatang: result.returnSatang,
          reason: "cancellation_credit",
          refType: "booking",
          refId: bk.id,
          createdBy: null,
          createdAt: ctx.now,
        });
        await db.update(
          customer,
          { creditBalanceSatang: c.creditBalanceSatang + result.returnSatang, updatedAt: ctx.now },
          eq(customer.id, c.id),
        );
      } else if (result.returnSatang > 0) {
        // Q-0068: refund.created_by must be staff; the shop transfers it back and records proof later
        const [owner] = (await db.select(
          staffUser,
          and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")),
        )) as (typeof staffUser.$inferSelect)[];
        if (!owner) throw new Error("liff.cancel: no active owner to record the refund");
        const [row] = (await db.insert(refund, {
          bookingId: bk.id,
          customerId: bk.customerId,
          amountSatang: result.returnSatang,
          mode: "bank_transfer",
          reason: reason ?? "liff.cancel",
          createdBy: owner.id,
          createdAt: ctx.now,
        })) as (typeof refund.$inferSelect)[];
        if (!row) throw new Error("liff.cancel: refund not created");
        await writeAudit(tx, ctx, {
          action: "refund.create",
          entityType: "refund",
          entityId: row.id,
          after: { bookingId: bk.id, amountSatang: row.amountSatang, mode: row.mode, createdBy: owner.id },
        });
      }
      const to = result.returnSatang === 0 ? "forfeited" : result.returnMode === "credit" ? "credited" : "refunded";
      await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to, reason });
    }

    // R-09: a late cancel counts for 12 months
    if (result.isLate) {
      const [c] = (await db.select(customer, eq(customer.id, bk.customerId)).for("update")) as (typeof customer.$inferSelect)[];
      if (c) {
        const late = c.lateCancelCount12m + 1;
        const { level } = computeReliability({
          noShowCount12m: c.noShowCount12m,
          lateCancelCount12m: late,
          completedVisits12m: 0,
          override: null,
        });
        // completed visits only lift a customer to level 4, which a late cancel rules out
        await db.update(customer, { lateCancelCount12m: late, reliabilityLevel: level, updatedAt: ctx.now }, eq(customer.id, c.id));
      }
    }

    // jobs whose dedupe key names this booking or one of its children
    for (const prefix of [`expire_hold:${bk.id}:`, `approval_overdue:${bk.id}:`, ...kids.map((k) => `reminder_24h:${k.row.id}:`)])
      await cancelJobs(tx, prefix, ctx);

    // staff.booking_cancelled: customerName = owner_profile.first_name (as staff.new_booking, Q-1049)
    const [c] = (await db.select(customer, eq(customer.id, bk.customerId))) as (typeof customer.$inferSelect)[];
    // owner_profile has no organization_id: reached through the org-checked customer
    const [profile] = c ? await tx.select().from(ownerProfile).where(eq(ownerProfile.id, c.ownerProfileId)) : [];
    const staff = (await db.select(
      staffUser,
      and(inArray(staffUser.role, ["front_desk", "owner"]), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of staff)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: bk.branchId },
        {
          key: "staff.booking_cancelled",
          recipient: { type: "staff", id: member.id },
          payload: { bookingNo: bk.bookingNo, customerName: profile?.firstName ?? "", isLate: result.isLate ? "(ยกเลิกกระชั้น)" : "" },
          dedupeKey: `staff_booking_cancelled:${bk.id}`,
        },
      );
  });
  return liffBooking(ctx, { branchSlug: input.branchSlug, bookingId: input.bookingId }) as Promise<LiffCancelResponse>;
}
