import type { BookingsWaiveDepositRequest, BookingsWaiveDepositResponse } from "@app/contracts/endpoints/bookings.waiveDeposit";
import { booking } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "./get.ts";
import { leaveAwaitingDeposit } from "./recordDeposit.ts";

/**
 * 05#ep-bookings.waiveDeposit: deposit pending|submitted|rejected → not_required, deposit_required = 0, hold cleared,
 * audit deposit.waive; an awaiting_deposit booking moves on as with a recorded deposit (03).
 */
export async function bookingsWaiveDeposit(
  ctx: RequestContext,
  input: BookingsWaiveDepositRequest & { bookingId: string },
): Promise<BookingsWaiveDepositResponse> {
  requireRole(ctx, "bookings.waiveDeposit");
  await withTx(ctx, async (tx) => {
    const [bk] = (await tenantDb(ctx, tx)
      .select(booking, eq(booking.id, input.bookingId))
      .for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    if (
      !["pending", "submitted", "rejected"].includes(bk.depositStatus) ||
      !["awaiting_deposit", "confirmed", "awaiting_approval"].includes(bk.status)
    )
      throw new AppError("INVALID_TRANSITION");
    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "deposit",
      to: "not_required",
      reason: input.reason,
      extraSet: { depositRequiredSatang: 0, holdExpiresAt: null },
    });
    await writeAudit(tx, ctx, {
      action: "deposit.waive",
      entityType: "booking",
      entityId: bk.id,
      reason: input.reason,
      before: { depositRequiredSatang: bk.depositRequiredSatang, depositStatus: bk.depositStatus },
      after: { depositRequiredSatang: 0, depositStatus: "not_required" },
    });
    if (bk.status === "awaiting_deposit") await leaveAwaitingDeposit(tx, ctx, bk, input.reason);
  });
  return bookingDetail(ctx, getDb(), input.bookingId);
}
