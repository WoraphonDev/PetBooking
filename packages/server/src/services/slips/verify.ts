import type { SlipsVerifyRequest, SlipsVerifyResponse } from "@app/contracts/endpoints/slips.verify";
import { bill, booking, branch, payment, paymentSlip } from "@app/db/schema";
import { applyPayment } from "@app/domain/billing/totals";
import { formatTHB } from "@app/domain/format/thai";
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
import { leaveAwaitingDeposit } from "../bookings/recordDeposit.ts";
import { slipItems } from "./list.ts";

type SlipRow = typeof paymentSlip.$inferSelect;

/**
 * 05#ep-slips.verify (one transaction): submitted only (else STATUS_NOT_ALLOWED); a duplicate (R-05) needs
 * confirmDuplicate (DUPLICATE_SLIP_CONFIRM_REQUIRED). The slip → verified, a promptpay payment with slip_id, audit
 * slip.verify. Booking slip: deposit_verified += amount, deposit → verified (a short amount stays partly paid), a booking
 * in deposit_review moves on (awaiting_approval when it needed approval unless approveBooking, else confirmed with
 * reminders + booking_confirmed), customer.deposit_confirmed. Bill slip: the payment goes to the open bill (R-15).
 */
export async function slipsVerify(ctx: RequestContext, input: SlipsVerifyRequest & { slipId: string }): Promise<SlipsVerifyResponse> {
  requireRole(ctx, "slips.verify");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(paymentSlip, eq(paymentSlip.id, input.slipId)).for("update")) as SlipRow[];
    if (!s) throw new AppError("NOT_FOUND");
    if (s.status !== "submitted") throw new AppError("STATUS_NOT_ALLOWED", { status: s.status });
    if (s.duplicateOfSlipId && !input.confirmDuplicate)
      throw new AppError("DUPLICATE_SLIP_CONFIRM_REQUIRED", { duplicateOfSlipId: s.duplicateOfSlipId });

    const updated = (await transition(tx, ctx, {
      table: paymentSlip,
      id: s.id,
      machine: "payment_slip",
      to: "verified",
      extraSet: { reviewedBy: ctx.actor.id, reviewedAt: ctx.now },
    })) as SlipRow;

    // bill slip (liff.payUploadSlip): the payment belongs to the open bill
    if (s.billId && !s.bookingId) {
      const [b] = (await db.select(bill, eq(bill.id, s.billId)).for("update")) as (typeof bill.$inferSelect)[];
      if (!b) throw new AppError("NOT_FOUND");
      if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
      const applied = applyPayment({ dueSatang: b.totalSatang - b.paidSatang, method: "promptpay", amountSatang: input.amountSatang });
      if ("error" in applied) throw new AppError(applied.error);
      const [p] = (await db.insert(payment, {
        branchId: s.branchId,
        billId: b.id,
        method: "promptpay",
        amountSatang: applied.amountSatang,
        slipId: s.id,
        receivedBy: ctx.actor.id,
        receivedAt: ctx.now,
      })) as (typeof payment.$inferSelect)[];
      await db.update(bill, { paidSatang: b.paidSatang + applied.amountSatang, updatedAt: ctx.now }, eq(bill.id, b.id));
      await audit(tx, ctx, s, p?.id ?? null, applied.amountSatang);
      return updated;
    }

    const [bk] = s.bookingId
      ? ((await db.select(booking, eq(booking.id, s.bookingId)).for("update")) as (typeof booking.$inferSelect)[])
      : [];
    if (!bk) throw new AppError("NOT_FOUND");
    const [p] = (await db.insert(payment, {
      branchId: s.branchId,
      bookingId: bk.id,
      method: "promptpay",
      amountSatang: input.amountSatang,
      slipId: s.id,
      receivedBy: ctx.actor.id,
      receivedAt: ctx.now,
    })) as (typeof payment.$inferSelect)[];
    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "deposit",
      to: "verified",
      extraSet: { depositVerifiedSatang: bk.depositVerifiedSatang + input.amountSatang },
    });
    if (bk.status === "deposit_review") {
      // approveBooking: approve now instead of waiting in awaiting_approval
      const approveNow = input.approveBooking && bk.approvalDueAt !== null;
      await leaveAwaitingDeposit(tx, ctx, approveNow ? { ...bk, approvalDueAt: null } : bk, null);
      if (approveNow) await cancelJobs(tx, `approval_overdue:${bk.id}:`, ctx);
    }
    await audit(tx, ctx, s, p?.id ?? null, input.amountSatang);
    const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
    await enqueueNotification(
      tx,
      { ...ctx, branchId: bk.branchId, timezone: br?.timezone ?? ctx.timezone },
      {
        key: "customer.deposit_confirmed",
        recipient: { type: "customer", id: bk.customerId },
        payload: { bookingNo: bk.bookingNo, amount: formatTHB({ satang: input.amountSatang }) },
        dedupeKey: `deposit_confirmed:${bk.id}`,
      },
    );
    return updated;
  });
  const [item] = await slipItems(ctx, getDb(), [row]);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}

function audit(tx: Parameters<typeof writeAudit>[0], ctx: RequestContext, s: SlipRow, paymentId: string | null, amountSatang: number) {
  return writeAudit(tx, ctx, {
    action: "slip.verify",
    entityType: "payment_slip",
    entityId: s.id,
    before: { status: "submitted" },
    after: {
      status: "verified",
      amountSatang,
      paymentId,
      bookingId: s.bookingId,
      billId: s.billId,
      duplicateOfSlipId: s.duplicateOfSlipId,
    },
  });
}
