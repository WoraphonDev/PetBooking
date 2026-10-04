import type { BookingsCancelPreviewRequest, BookingsCancelPreviewResponse } from "@app/contracts/endpoints/bookings.cancelPreview";
import { booking, daycareVisit, groomAppointment, stay } from "@app/db/schema";
import { computeCancellation } from "@app/domain/payment/cancellation";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type Snapshot = Partial<Record<string, unknown>>;

/** R-07 inputs of a booking: its modules and the policy as booked (branch_policy column defaults fill keys an old snapshot lacks). */
export async function cancellationInput(ctx: RequestContext, bk: typeof booking.$inferSelect) {
  const db = tenantDb(ctx, getDb());
  const modules: ("grooming" | "hotel" | "daycare")[] = [];
  if ((await db.select(groomAppointment, eq(groomAppointment.bookingId, bk.id))).length) modules.push("grooming");
  if ((await db.select(stay, eq(stay.bookingId, bk.id))).length) modules.push("hotel");
  if ((await db.select(daycareVisit, eq(daycareVisit.bookingId, bk.id))).length) modules.push("daycare");
  const snap = bk.policySnapshot as Snapshot;
  return {
    now: ctx.now.toISOString(),
    firstServiceAt: (bk.firstServiceAt ?? ctx.now).toISOString(),
    modules,
    depositVerifiedSatang: bk.depositVerifiedSatang,
    policySnapshot: {
      groomingFreeCancelHours: Number(snap.groomingFreeCancelHours ?? 24),
      hotelFreeCancelHours: Number(snap.hotelFreeCancelHours ?? 72),
      daycareFreeCancelHours: Number(snap.daycareFreeCancelHours ?? 24),
      lateCancelForfeitPercent: Number(snap.lateCancelForfeitPercent ?? 100),
      cancelRefundMode: (snap.cancelRefundMode as "refund" | "credit" | "customer_choice" | undefined) ?? "credit",
    },
  };
}

/** 05#ep-bookings.cancelPreview: R-07 CancelResult for cancelling now, read-only. */
export async function bookingsCancelPreview(
  ctx: RequestContext,
  input: BookingsCancelPreviewRequest,
): Promise<BookingsCancelPreviewResponse> {
  requireRole(ctx, "bookings.cancelPreview");
  const [bk] = (await tenantDb(ctx, getDb()).select(booking, eq(booking.id, input.bookingId))) as (typeof booking.$inferSelect)[];
  if (!bk) throw new AppError("NOT_FOUND");
  return computeCancellation({ ...(await cancellationInput(ctx, bk)), kind: input.kind });
}
