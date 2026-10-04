import type { StaysCancelRequest, StaysCancelResponse } from "@app/contracts/endpoints/stays.cancel";
import { booking, daycareVisit, groomAppointment, stay, stayAddon } from "@app/db/schema";
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
 * 05#ep-stays.cancel: one reserved stay → cancelled (reason on booking_event; other statuses → INVALID_TRANSITION), its
 * reminder_24h cancelled, booking estimate − room total − add-ons. Like groom.cancel, the booking's last active item goes
 * through bookings.cancel instead (STATUS_NOT_ALLOWED {hint}).
 */
export async function staysCancel(ctx: RequestContext, input: StaysCancelRequest & { stayId: string }): Promise<StaysCancelResponse> {
  requireRole(ctx, "stays.cancel");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId))) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, s.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const others = [
      ...(await db.select(stay, and(eq(stay.bookingId, bk.id), ne(stay.id, s.id), notInArray(stay.status, [...ENDED])))),
      ...(await db.select(groomAppointment, and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, [...ENDED])))),
      ...(await db.select(daycareVisit, and(eq(daycareVisit.bookingId, bk.id), notInArray(daycareVisit.status, [...ENDED])))),
    ];
    if (others.length === 0 && s.status === "reserved")
      throw new AppError("STATUS_NOT_ALLOWED", { hint: "bookings.cancel", reason: "last active item of the booking" });
    await transition(tx, ctx, { table: stay, id: s.id, machine: "stay", to: "cancelled", reason: input.reason });
    await cancelJobs(tx, `reminder_24h:${s.id}:`, ctx);
    const addons = (await db.select(stayAddon, eq(stayAddon.stayId, s.id))) as (typeof stayAddon.$inferSelect)[];
    const total = s.roomTotalSatang + addons.reduce((sum, a) => sum + a.totalSatang, 0);
    await db.update(
      booking,
      { estimatedTotalSatang: Math.max(0, bk.estimatedTotalSatang - total), updatedAt: ctx.now },
      eq(booking.id, bk.id),
    );
    return bk.id;
  });
  return bookingDetail(ctx, getDb(), bookingId);
}
