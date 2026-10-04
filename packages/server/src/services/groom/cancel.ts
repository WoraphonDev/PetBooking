import type { GroomCancelRequest, GroomCancelResponse } from "@app/contracts/endpoints/groom.cancel";
import { booking, daycareVisit, groomAppointment, stay } from "@app/db/schema";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;
/** children that no longer need the booking */
const ENDED = ["cancelled", "no_show"] as const;

/**
 * 05#ep-groom.cancel: one appointment scheduled|checked_in → cancelled (slot released), estimate reduced.
 * The booking's last active child goes through bookings.cancel instead (STATUS_NOT_ALLOWED with a hint).
 */
export async function groomCancel(
  ctx: RequestContext,
  input: GroomCancelRequest & { appointmentId: string },
): Promise<GroomCancelResponse> {
  requireRole(ctx, "groom.cancel");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, a.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const others = [
      ...(await db.select(
        groomAppointment,
        and(eq(groomAppointment.bookingId, bk.id), ne(groomAppointment.id, a.id), notInArray(groomAppointment.status, [...ENDED])),
      )),
      ...(await db.select(stay, and(eq(stay.bookingId, bk.id), notInArray(stay.status, [...ENDED])))),
      ...(await db.select(daycareVisit, and(eq(daycareVisit.bookingId, bk.id), notInArray(daycareVisit.status, [...ENDED])))),
    ];
    if (others.length === 0 && !ENDED.includes(a.status as (typeof ENDED)[number]))
      throw new AppError("STATUS_NOT_ALLOWED", { hint: "bookings.cancel", reason: "last active item of the booking" });
    await transition(tx, ctx, { table: groomAppointment, id: a.id, machine: "groom_appointment", to: "cancelled", reason: input.reason });
    await db.update(
      booking,
      { estimatedTotalSatang: Math.max(0, bk.estimatedTotalSatang - a.servicesTotalSatang - a.surchargeTotalSatang), updatedAt: ctx.now },
      eq(booking.id, bk.id),
    );
    return bk.id;
  });
  return bookingDetail(ctx, getDb(), bookingId);
}
