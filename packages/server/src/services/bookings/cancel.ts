import type { BookingsCancelRequest, BookingsCancelResponse } from "@app/contracts/endpoints/bookings.cancel";
import { booking, branch, creditLedger, customer, daycareVisit, groomAppointment, refund, stay } from "@app/db/schema";
import { computeReliability } from "@app/domain/customer/reliability";
import { formatTHB } from "@app/domain/format/thai";
import { computeCancellation } from "@app/domain/payment/cancellation";
import * as daycareState from "@app/domain/state/daycare_visit";
import * as groomState from "@app/domain/state/groom_appointment";
import * as stayState from "@app/domain/state/stay";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "./get.ts";

type Snapshot = Partial<Record<string, unknown>>;
type Child = { id: string; status: string };
const CANCELLABLE = ["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed"];
const ENDED = ["cancelled", "no_show"];
const children = [
  { table: groomAppointment, machine: "groom_appointment", module: "grooming", canTransition: groomState.canTransition },
  { table: stay, machine: "stay", module: "hotel", canTransition: stayState.canTransition },
  { table: daycareVisit, machine: "daycare_visit", module: "daycare", canTransition: daycareState.canTransition },
] as const;

/**
 * 05#ep-bookings.cancel (one transaction): booking → cancelled, every child → cancelled (a child already being served →
 * STATUS_NOT_ALLOWED, 03 "before service starts"), R-07 on a verified deposit with the booked policy (credit → credit_ledger
 * cancellation_credit + balance, deposit credited; refund → refund row awaiting the shop's transfer, deposit refunded;
 * nothing returned → forfeited), cancel_is_late (Q-0084), late → late_cancel_count_12m + 1 → R-09, pending jobs of the
 * booking and its children cancelled, audit booking.cancel, customer.booking_cancelled with the money line (Q-0103).
 */
export async function bookingsCancel(
  ctx: RequestContext,
  input: BookingsCancelRequest & { bookingId: string },
): Promise<BookingsCancelResponse> {
  requireRole(ctx, "bookings.cancel");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [bk] = (await db.select(booking, eq(booking.id, input.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    if (!CANCELLABLE.includes(bk.status)) throw new AppError("INVALID_TRANSITION");

    const kids = [];
    for (const c of children)
      for (const row of (await db.select(c.table, eq(c.table.bookingId, bk.id))) as Child[]) kids.push({ ...c, row });
    const started = kids.find((k) => !ENDED.includes(k.row.status) && !k.canTransition(k.row.status as never, "cancelled"));
    if (started) throw new AppError("STATUS_NOT_ALLOWED", { childId: started.row.id, status: started.row.status });

    const snap = bk.policySnapshot as Snapshot;
    const result = computeCancellation({
      now: ctx.now.toISOString(),
      firstServiceAt: (bk.firstServiceAt ?? ctx.now).toISOString(),
      modules: [...new Set(kids.map((k) => k.module))],
      kind: input.kind,
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

    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "booking",
      to: "cancelled",
      reason: input.reason,
      extraSet: { cancelledAt: ctx.now, cancelledByType: "staff", cancelReason: input.reason, cancelIsLate: result.isLate },
    });
    for (const k of kids)
      if (!ENDED.includes(k.row.status))
        await transition(tx, ctx, { table: k.table, id: k.row.id, machine: k.machine, to: "cancelled", reason: input.reason });

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
          createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
          createdAt: ctx.now,
        });
        await db.update(
          customer,
          { creditBalanceSatang: c.creditBalanceSatang + result.returnSatang, updatedAt: ctx.now },
          eq(customer.id, c.id),
        );
      } else if (result.returnSatang > 0) {
        // the shop transfers it back and records proof later
        await db.insert(refund, {
          bookingId: bk.id,
          customerId: bk.customerId,
          amountSatang: result.returnSatang,
          mode: "bank_transfer",
          reason: input.reason,
          createdBy: ctx.actor.id as string,
          createdAt: ctx.now,
        });
      }
      const to = result.returnSatang === 0 ? "forfeited" : result.returnMode === "credit" ? "credited" : "refunded";
      await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to, reason: input.reason });
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

    await writeAudit(tx, ctx, {
      action: "booking.cancel",
      entityType: "booking",
      entityId: bk.id,
      reason: input.reason,
      before: { status: bk.status, depositStatus: bk.depositStatus },
      after: {
        status: "cancelled",
        kind: input.kind,
        isLate: result.isLate,
        forfeitSatang: result.forfeitSatang,
        returnSatang: result.returnSatang,
        returnMode: result.returnMode,
      },
    });

    // Q-0103 money line
    const parts: string[] = [];
    if (result.forfeitSatang > 0) parts.push(`ริบมัดจำ ${formatTHB({ satang: result.forfeitSatang })} ตามนโยบายร้าน`);
    if (result.returnSatang > 0)
      parts.push(
        result.returnMode === "credit"
          ? `คืนเป็นเครดิต ${formatTHB({ satang: result.returnSatang })} ใช้ได้ครั้งหน้า`
          : `ร้านจะคืนเงิน ${formatTHB({ satang: result.returnSatang })}`,
      );
    const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
    await enqueueNotification(
      tx,
      { ...ctx, branchId: bk.branchId, timezone: br?.timezone ?? ctx.timezone },
      {
        key: "customer.booking_cancelled",
        recipient: { type: "customer", id: bk.customerId },
        payload: { bookingNo: bk.bookingNo, reason: input.reason, moneyLine: parts.join(" · ") },
        dedupeKey: `booking_cancelled:${bk.id}`,
      },
    );
  });
  return bookingDetail(ctx, getDb(), input.bookingId);
}
