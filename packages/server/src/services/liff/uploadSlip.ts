import type { LiffUploadSlipRequest, LiffUploadSlipResponse } from "@app/contracts/endpoints/liff.uploadSlip";
import { booking, paymentSlip, staffUser } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { findDuplicateSlip, parseSlipQr } from "@app/domain/payment/slip";
import { and, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { liffBooking } from "./booking.ts";

/**
 * 05#ep-liff.uploadSlip (one transaction): the customer's own booking (else NOT_FOUND). A hold already past
 * hold_expires_at, or a booking the expire_hold job already expired → HOLD_EXPIRED; any other status than
 * awaiting_deposit → STATUS_NOT_ALLOWED (Q-1044). A submitted deposit slip (R-05 trans_ref + duplicate link, amount =
 * deposit still due), booking awaiting_deposit→deposit_review with hold_expires_at cleared, deposit → submitted (both write
 * booking_event), staff.slip_submitted to active front_desk + owner (dedupe slip_submitted:{slipId}). Returns MyBookingDetail.
 */
export async function liffUploadSlip(
  ctx: RequestContext,
  input: LiffUploadSlipRequest & { bookingId: string; branchSlug: string },
): Promise<LiffUploadSlipResponse> {
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
    const [bk] = (await db
      .select(booking, and(eq(booking.id, input.bookingId), eq(booking.customerId, ctx.actor.id)))
      .for("update")) as (typeof booking.$inferSelect)[];
    if (!bk || bk.branchId !== ctx.branchId) throw new AppError("NOT_FOUND");
    const holdPassed = bk.holdExpiresAt !== null && bk.holdExpiresAt <= ctx.now;
    if (bk.status === "expired" || (bk.status === "awaiting_deposit" && holdPassed)) throw new AppError("HOLD_EXPIRED");
    if (bk.status !== "awaiting_deposit") throw new AppError("STATUS_NOT_ALLOWED", { status: bk.status });

    await commitFile(tx, ctx, input.fileId, "slip");
    const transRef = input.qrPayload ? (parseSlipQr({ payload: input.qrPayload })?.transRef ?? null) : null;
    const existing = transRef
      ? ((await db.select(paymentSlip, eq(paymentSlip.transRef, transRef))) as (typeof paymentSlip.$inferSelect)[])
      : [];
    const { duplicateOfSlipId } = findDuplicateSlip({
      transRef,
      existing: existing.map((s) => ({ id: s.id, transRef: s.transRef, status: s.status, createdAt: s.createdAt.toISOString() })),
    });
    const due = Math.max(bk.depositRequiredSatang - bk.depositVerifiedSatang, 0);
    const [slip] = (await db.insert(paymentSlip, {
      branchId: bk.branchId,
      bookingId: bk.id,
      fileId: input.fileId,
      uploadedByType: "customer",
      amountExpectedSatang: due,
      qrPayload: input.qrPayload ?? null,
      transRef,
      duplicateOfSlipId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof paymentSlip.$inferSelect)[];
    if (!slip) throw new Error("liff.uploadSlip: no inserted row");

    await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "deposit_review", extraSet: { holdExpiresAt: null } });
    await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "submitted" });

    const staff = (await db.select(
      staffUser,
      and(inArray(staffUser.role, ["front_desk", "owner"]), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of staff)
      await enqueueNotification(tx, ctx, {
        key: "staff.slip_submitted",
        recipient: { type: "staff", id: member.id },
        payload: {
          bookingNo: bk.bookingNo,
          amount: formatTHB({ satang: due }),
          duplicateFlag: duplicateOfSlipId ? "⚠️ สลิปนี้เคยใช้แล้ว" : "",
        },
        dedupeKey: `slip_submitted:${slip.id}`,
      });
  });
  return liffBooking(ctx, { branchSlug: input.branchSlug, bookingId: input.bookingId });
}
