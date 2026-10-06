import type { LiffPayUploadSlipRequest, LiffPayUploadSlipResponse } from "@app/contracts/endpoints/liff.payUploadSlip";
import { bill, booking, branch, paymentSlip, staffUser } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { findDuplicateSlip, parseSlipQr } from "@app/domain/payment/slip";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/**
 * 05#ep-liff.payUploadSlip (one transaction): the customer's own open bill (else NOT_FOUND / BILL_NOT_OPEN, Q-1035) gets a
 * submitted bill slip (booking_id null — slips.verify pays the bill) for the amount due, with the R-05 trans_ref and
 * duplicate link; staff.slip_submitted to active front_desk + owner (dedupe slip_submitted:{slipId}). Returns the bill's
 * PaymentInstruction (R-30), as bills.promptpayQr builds it.
 */
export async function liffPayUploadSlip(
  ctx: RequestContext,
  input: LiffPayUploadSlipRequest & { billId: string },
): Promise<LiffPayUploadSlipResponse> {
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as (typeof bill.$inferSelect)[];
    if (!b || ctx.actor.type !== "customer" || !ctx.actor.id || b.customerId !== ctx.actor.id || b.branchId !== ctx.branchId)
      throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    const [br] = (await db.select(branch, eq(branch.id, b.branchId))) as (typeof branch.$inferSelect)[];
    if (!br?.promptpayType || !br.promptpayId) throw new AppError("PROMPTPAY_NOT_CONFIGURED");
    const due = Math.max(b.totalSatang - b.paidSatang, 0);
    // nothing due → a QR without an amount (R-30 step 1: 010211)
    const qr = promptPayPayload({ type: br.promptpayType, id: br.promptpayId, amountSatang: due > 0 ? due : null });
    if ("error" in qr) throw new AppError("PROMPTPAY_NOT_CONFIGURED");

    await commitFile(tx, ctx, input.fileId, "slip");
    const transRef = input.qrPayload ? (parseSlipQr({ payload: input.qrPayload })?.transRef ?? null) : null;
    const existing = transRef
      ? ((await db.select(paymentSlip, eq(paymentSlip.transRef, transRef))) as (typeof paymentSlip.$inferSelect)[])
      : [];
    const { duplicateOfSlipId } = findDuplicateSlip({
      transRef,
      existing: existing.map((s) => ({ id: s.id, transRef: s.transRef, status: s.status, createdAt: s.createdAt.toISOString() })),
    });
    const [slip] = (await db.insert(paymentSlip, {
      branchId: b.branchId,
      billId: b.id,
      fileId: input.fileId,
      uploadedByType: "customer",
      amountExpectedSatang: due,
      qrPayload: input.qrPayload ?? null,
      transRef,
      duplicateOfSlipId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof paymentSlip.$inferSelect)[];
    if (!slip) throw new Error("liff.payUploadSlip: no inserted row");

    // the bill's bookings give the notification its booking number (Q-1035)
    const [bk] = (await db.select(booking, eq(booking.billId, b.id)).orderBy(asc(booking.bookingNo))) as (typeof booking.$inferSelect)[];
    const staff = (await db.select(
      staffUser,
      and(inArray(staffUser.role, ["front_desk", "owner"]), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of staff)
      await enqueueNotification(tx, ctx, {
        key: "staff.slip_submitted",
        recipient: { type: "staff", id: member.id },
        payload: {
          bookingNo: bk?.bookingNo ?? "",
          amount: formatTHB({ satang: due }),
          duplicateFlag: duplicateOfSlipId ? "⚠️ สลิปนี้เคยใช้แล้ว" : "",
        },
        dedupeKey: `slip_submitted:${slip.id}`,
      });

    return {
      amountSatang: due,
      promptpayPayload: qr.payload,
      accountName: br.promptpayAccountName,
      promptpayIdMasked: br.promptpayId.slice(-3),
      expiresAt: null,
    };
  });
}
