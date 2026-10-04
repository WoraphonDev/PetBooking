import type { DaycareCancelRequest, DaycareCancelResponse } from "@app/contracts/endpoints/daycare.cancel";
import { booking, daycareVisit, groomAppointment, stay } from "@app/db/schema";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs } from "../../jobs/schedule.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "../bookings/get.ts";

const ENDED = ["cancelled", "no_show"] as const;

/**
 * 05#ep-daycare.cancel: one reserved visit → cancelled (reason on booking_event); other statuses → STATUS_NOT_ALLOWED
 * (the error 05 lists). Its reminder_24h is cancelled and the booking estimate lowered by its price. The booking's last
 * active item goes through bookings.cancel (STATUS_NOT_ALLOWED {hint}), as groom.cancel.
 */
export async function daycareCancel(
  ctx: RequestContext,
  input: DaycareCancelRequest & { visitId: string },
): Promise<DaycareCancelResponse> {
  requireRole(ctx, "daycare.cancel");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [v] = (await db.select(daycareVisit, eq(daycareVisit.id, input.visitId))) as (typeof daycareVisit.$inferSelect)[];
    if (!v) throw new AppError("NOT_FOUND");
    if (v.status !== "reserved") throw new AppError("STATUS_NOT_ALLOWED", { status: v.status });
    const [bk] = (await db.select(booking, eq(booking.id, v.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const others = [
      ...(await db.select(
        daycareVisit,
        and(eq(daycareVisit.bookingId, bk.id), ne(daycareVisit.id, v.id), notInArray(daycareVisit.status, [...ENDED])),
      )),
      ...(await db.select(groomAppointment, and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, [...ENDED])))),
      ...(await db.select(stay, and(eq(stay.bookingId, bk.id), notInArray(stay.status, [...ENDED])))),
    ];
    if (others.length === 0)
      throw new AppError("STATUS_NOT_ALLOWED", { hint: "bookings.cancel", reason: "last active item of the booking" });
    await transition(tx, ctx, { table: daycareVisit, id: v.id, machine: "daycare_visit", to: "cancelled", reason: input.reason });
    await cancelJobs(tx, `reminder_24h:${v.id}:`, ctx);
    await db.update(
      booking,
      { estimatedTotalSatang: Math.max(0, bk.estimatedTotalSatang - v.priceSatang), updatedAt: ctx.now },
      eq(booking.id, bk.id),
    );
    return bk.id;
  });
  const detail = await bookingDetail(ctx, getDb(), bookingId);
  const item = detail.daycare.find((d) => d.id === input.visitId);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}
