import { bill, booking, customer, daycareVisit, groomAppointment, organization, stay } from "@app/db/schema";
import { computeReliability } from "@app/domain/customer/reliability";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { makeSystemCtx } from "../../context.ts";
import { tenantDb } from "../../repo/tenant.ts";
import type { JobHandler } from "../runner.ts";

const monthsAgo = (now: Date, months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

/**
 * 07 §2 recompute_reliability (global, daily 03:00): rolling 12-month counts for every customer with activity in the last
 * 13 months or a non-zero count → customer.no_show_count_12m, late_cancel_count_12m and R-09 reliability_level (Q-0084, Q-0087).
 */
export const handler: JobHandler = async (tx, ctx) => {
  const since = monthsAgo(ctx.now, 12);
  const active = monthsAgo(ctx.now, 13);
  for (const org of await tx.select({ id: organization.id }).from(organization)) {
    const db = tenantDb(makeSystemCtx(org.id, ctx.now), tx);
    const recent = (await db.select(
      booking,
      or(gte(booking.createdAt, active), gte(booking.cancelledAt, active)),
    )) as (typeof booking.$inferSelect)[];
    const customers = (await db.select(customer)) as (typeof customer.$inferSelect)[];
    const touched = customers.filter((c) => c.noShowCount12m > 0 || c.lateCancelCount12m > 0 || recent.some((b) => b.customerId === c.id));
    for (const c of touched) {
      const bookings = (await db.select(booking, eq(booking.customerId, c.id))) as (typeof booking.$inferSelect)[];
      const ids = bookings.map((b) => b.id);
      // dates of stays/daycare are local days; the branch timezone of the booking decides (Asia/Bangkok in MVP)
      const sinceDate = toLocalDate({ instant: since.toISOString(), timezone: ctx.timezone });
      const noShows = ids.length
        ? (
            await db.select(
              groomAppointment,
              and(inArray(groomAppointment.bookingId, ids), eq(groomAppointment.status, "no_show"), gte(groomAppointment.startsAt, since)),
            )
          ).length +
          (await db.select(stay, and(inArray(stay.bookingId, ids), eq(stay.status, "no_show"), gte(stay.checkInDate, sinceDate)))).length +
          (
            await db.select(
              daycareVisit,
              and(inArray(daycareVisit.bookingId, ids), eq(daycareVisit.status, "no_show"), gte(daycareVisit.visitDate, sinceDate)),
            )
          ).length
        : 0;
      const lateCancels = bookings.filter((b) => b.cancelIsLate === true && b.cancelledAt !== null && b.cancelledAt >= since).length;
      // completed = picked_up / checked_out children of this customer's bills paid in the window (as bills.close, Q-0074)
      const paid = (await db.select(
        bill,
        and(eq(bill.customerId, c.id), eq(bill.status, "paid"), gte(bill.closedAt, since)),
      )) as (typeof bill.$inferSelect)[];
      const billed = bookings.filter((b) => b.billId && paid.some((p) => p.id === b.billId)).map((b) => b.id);
      const completed = billed.length
        ? (await db.select(groomAppointment, and(inArray(groomAppointment.bookingId, billed), eq(groomAppointment.status, "picked_up"))))
            .length +
          (await db.select(stay, and(inArray(stay.bookingId, billed), eq(stay.status, "checked_out")))).length +
          (await db.select(daycareVisit, and(inArray(daycareVisit.bookingId, billed), eq(daycareVisit.status, "checked_out")))).length
        : 0;
      const { level } = computeReliability({
        noShowCount12m: noShows,
        lateCancelCount12m: lateCancels,
        completedVisits12m: completed,
        override: null,
      });
      // idempotent: only write what changed
      if (c.noShowCount12m === noShows && c.lateCancelCount12m === lateCancels && c.reliabilityLevel === level) continue;
      await db.update(
        customer,
        { noShowCount12m: noShows, lateCancelCount12m: lateCancels, reliabilityLevel: level, updatedAt: ctx.now },
        eq(customer.id, c.id),
      );
    }
  }
};
