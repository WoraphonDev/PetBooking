import type { DashboardTodayRequest, DashboardTodayResponse } from "@app/contracts/endpoints/dashboard.today";
import { groomStatusValues } from "@app/contracts/enums";
import {
  bill,
  booking,
  branch,
  careTask,
  customerLinkRequest,
  daycareVisit,
  groomAppointment,
  notification,
  payment,
  paymentSlip,
  reportCard,
  roomUnit,
  stay,
} from "@app/db/schema";
import { localDayBounds, toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gte, inArray, isNull, lt, ne, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Today's counters for the session branch (05#dto-DashboardToday, R-20 local day, definitions per Q-0053). */
export async function dashboardToday(ctx: RequestContext, _input: DashboardTodayRequest): Promise<DashboardTodayResponse> {
  requireRole(ctx, "dashboard.today");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = tenantDb(ctx, getDb());
  const [br] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const date = toLocalDate({ instant: ctx.now.toISOString(), timezone: br.timezone });
  const bounds = localDayBounds({ date, timezone: br.timezone });
  const [start, end] = [new Date(bounds.start), new Date(bounds.end)];
  const today = (col: Parameters<typeof gte>[0]) => and(gte(col, start), lt(col, end));

  const appointments = (await db.select(
    groomAppointment,
    and(eq(groomAppointment.branchId, br.id), today(groomAppointment.startsAt), ne(groomAppointment.status, "cancelled")),
  )) as (typeof groomAppointment.$inferSelect)[];
  const byStatus = Object.fromEntries(
    groomStatusValues.filter((s) => s !== "cancelled").map((s) => [s, appointments.filter((a) => a.status === s).length]),
  ) as DashboardTodayResponse["groom"]["byStatus"];

  const stays = (await db.select(stay, and(eq(stay.branchId, br.id), ne(stay.status, "cancelled")))) as (typeof stay.$inferSelect)[];
  const inHouse = stays.filter((s) => s.status === "checked_in").length;
  const units = await db.select(roomUnit, and(eq(roomUnit.branchId, br.id), eq(roomUnit.status, "active")));
  const daycare = await db.select(
    daycareVisit,
    and(eq(daycareVisit.branchId, br.id), eq(daycareVisit.visitDate, date), ne(daycareVisit.status, "cancelled")),
  );

  const pickedUp = (await db.select(
    groomAppointment,
    and(eq(groomAppointment.branchId, br.id), eq(groomAppointment.status, "picked_up"), today(groomAppointment.pickedUpAt)),
  )) as (typeof groomAppointment.$inferSelect)[];
  const unbilled = pickedUp.length
    ? await db.select(
        booking,
        and(
          inArray(
            booking.id,
            pickedUp.map((a) => a.bookingId),
          ),
          isNull(booking.billId),
        ),
      )
    : [];
  const unbilledIds = new Set(unbilled.map((b) => (b as typeof booking.$inferSelect).id));

  const todo = {
    pendingSlips: (await db.select(paymentSlip, and(eq(paymentSlip.branchId, br.id), eq(paymentSlip.status, "submitted")))).length,
    pendingApprovals: (await db.select(booking, and(eq(booking.branchId, br.id), eq(booking.status, "awaiting_approval")))).length,
    overdueCareTasks: (
      await db.select(careTask, and(eq(careTask.branchId, br.id), eq(careTask.status, "pending"), lt(careTask.dueAt, ctx.now)))
    ).length,
    reportCardsToReview: (await db.select(reportCard, and(eq(reportCard.branchId, br.id), eq(reportCard.status, "pending_review")))).length,
    unsentMessages: (
      await db.select(
        notification,
        and(eq(notification.branchId, br.id), eq(notification.status, "skipped"), today(notification.createdAt)),
      )
    ).length,
    pickupsWithoutBill: pickedUp.filter((a) => unbilledIds.has(a.bookingId)).length,
    // customer_link_request has no branch: MVP = 1 branch per organization
    linkRequests: (await db.select(customerLinkRequest, eq(customerLinkRequest.status, "pending"))).length,
  };

  const result: DashboardTodayResponse = {
    date,
    groom: { total: appointments.length, byStatus },
    hotel: {
      arrivals: stays.filter((s) => s.checkInDate === date).length,
      departures: stays.filter((s) => s.checkOutDate === date).length,
      inHouse,
      occupancyPercent: units.length ? Math.min(100, Math.round((inHouse / units.length) * 100)) : 0,
    },
    daycare: { count: daycare.length },
    todo,
  };
  if (ctx.actor.role !== "front_desk") {
    const payments = (await db.select(
      payment,
      and(
        eq(payment.branchId, br.id),
        eq(payment.status, "posted"),
        notInArray(payment.method, ["deposit", "credit"]),
        today(payment.receivedAt),
      ),
    )) as (typeof payment.$inferSelect)[];
    const closed = await db.select(bill, and(eq(bill.branchId, br.id), eq(bill.status, "paid"), today(bill.closedAt)));
    result.sales = { paidTotalSatang: payments.reduce((sum, p) => sum + p.amountSatang, 0), billsClosed: closed.length };
  }
  return result;
}
