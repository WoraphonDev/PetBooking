import type { LiffBookingRequest, LiffBookingResponse } from "@app/contracts/endpoints/liff.booking";
import { branch } from "@app/db/schema";
import { computeCancellation } from "@app/domain/payment/cancellation";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { cancellationInput } from "../bookings/cancelPreview.ts";
import { bookingLines, myBookingItem, requireMyBooking, selfService } from "./bookings.ts";

/**
 * 05#ep-liff.booking: MyBookingDetail of the customer's own booking (else NOT_FOUND). payment = the deposit still due while
 * the deposit is pending/rejected and the branch has PromptPay (as bookings.get, R-30); cancelPreview = R-07 customer_cancel
 * while R-21 allows cancelling; rescheduleBlockedReason = R-21.
 */
export async function liffBooking(ctx: RequestContext, input: LiffBookingRequest): Promise<LiffBookingResponse> {
  const db = getDb();
  const bk = await requireMyBooking(ctx, db, input.bookingId);
  const [br] = (await tenantDb(ctx, db).select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const lines = await bookingLines(ctx, db, bk);
  const rule = selfService(ctx, bk);

  const due = bk.depositRequiredSatang - bk.depositVerifiedSatang;
  const qr =
    ["pending", "rejected"].includes(bk.depositStatus) && due > 0 && br.promptpayType && br.promptpayId
      ? promptPayPayload({ type: br.promptpayType, id: br.promptpayId, amountSatang: due })
      : null;
  const payment =
    qr && "payload" in qr && br.promptpayId
      ? {
          amountSatang: due,
          promptpayPayload: qr.payload,
          accountName: br.promptpayAccountName,
          promptpayIdMasked: br.promptpayId.slice(-3),
          expiresAt: bk.holdExpiresAt?.toISOString() ?? null,
        }
      : null;

  return {
    booking: myBookingItem(ctx, bk, lines),
    groom: lines.groom,
    stays: lines.stays,
    daycare: lines.daycare,
    payment,
    policySnapshot: bk.policySnapshot as Record<string, unknown>,
    cancelPreview: rule.canCancel ? computeCancellation({ ...(await cancellationInput(ctx, bk)), kind: "customer_cancel" }) : null,
    rescheduleBlockedReason: rule.rescheduleBlockedReason,
    shopPhone: br.phone,
    mapUrl:
      br.latitude !== null && br.longitude !== null
        ? `https://www.google.com/maps/search/?api=1&query=${br.latitude},${br.longitude}`
        : null,
    icsUrl: `/api/v1/liff/${br.bookingSlug}/bookings/${bk.id}/calendar.ics`,
  };
}
