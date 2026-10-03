import { branch, daycareVisit, groomAppointment, payment, staffUser, stay } from "@app/db/schema";
import { formatTHB, formatThaiDate } from "@app/domain/format/thai";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, gte, lt, ne, notInArray } from "drizzle-orm";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import type { JobHandler } from "../runner.ts";

const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * 07 §2 owner_daily_summary: the DashboardToday numbers of `localDate` (05#dto-DashboardToday, Q-0053) → owner.daily_summary
 * to every active owner. Counted for the payload's local day, not ctx.now, so a late retry still reports the right day.
 */
export const handler: JobHandler = async (tx, ctx, job) => {
  const { branchId, localDate } = job.payload as { branchId: string; localDate: string };
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, branchId))) as (typeof branch.$inferSelect)[];
  if (!br) return;
  const day = (date: string) => {
    const b = localDayBounds({ date, timezone: br.timezone });
    return (col: Parameters<typeof gte>[0]) => and(gte(col, new Date(b.start)), lt(col, new Date(b.end)));
  };
  const today = day(localDate);
  const tomorrow = nextDate(localDate);

  const grooms = (await db.select(
    groomAppointment,
    and(eq(groomAppointment.branchId, br.id), today(groomAppointment.startsAt), ne(groomAppointment.status, "cancelled")),
  )) as (typeof groomAppointment.$inferSelect)[];
  const inHouse = await db.select(stay, and(eq(stay.branchId, br.id), eq(stay.status, "checked_in")));
  const payments = (await db.select(
    payment,
    and(
      eq(payment.branchId, br.id),
      eq(payment.status, "posted"),
      notInArray(payment.method, ["deposit", "credit"]),
      today(payment.receivedAt),
    ),
  )) as (typeof payment.$inferSelect)[];
  // Q-0066: tomorrow = grooming appointments + hotel check-ins + daycare visits, cancelled excluded
  const tomorrowCount =
    (
      await db.select(
        groomAppointment,
        and(eq(groomAppointment.branchId, br.id), day(tomorrow)(groomAppointment.startsAt), ne(groomAppointment.status, "cancelled")),
      )
    ).length +
    (await db.select(stay, and(eq(stay.branchId, br.id), eq(stay.checkInDate, tomorrow), ne(stay.status, "cancelled")))).length +
    (
      await db.select(
        daycareVisit,
        and(eq(daycareVisit.branchId, br.id), eq(daycareVisit.visitDate, tomorrow), ne(daycareVisit.status, "cancelled")),
      )
    ).length;

  const payload = {
    date: formatThaiDate({ date: localDate }),
    groomCount: grooms.length,
    staysInHouse: inHouse.length,
    salesTotal: formatTHB({ satang: payments.reduce((sum, p) => sum + p.amountSatang, 0) }),
    noShows: grooms.filter((g) => g.status === "no_show").length,
    tomorrowCount,
  };
  const owners = (await db.select(
    staffUser,
    and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")),
  )) as (typeof staffUser.$inferSelect)[];
  for (const owner of owners)
    await enqueueNotification(
      tx,
      { ...ctx, branchId: br.id, timezone: br.timezone },
      { key: "owner.daily_summary", recipient: { type: "staff", id: owner.id }, payload, dedupeKey: `daily_summary:${br.id}:${localDate}` },
    );
};
