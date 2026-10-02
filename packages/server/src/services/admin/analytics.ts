import type { AdminAnalyticsQuery, AdminAnalyticsResponse } from "@app/contracts/endpoints/admin.analytics";
import { type BookingChannel, bookingChannelValues } from "@app/contracts/enums";
import {
  bill,
  booking,
  branch,
  branchHours,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  notification,
  organization,
  reportCard,
  stay,
} from "@app/db/schema";
import { localDayBounds, localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { type TenantTable, tenantDb } from "../../repo/tenant.ts";

const TIMEZONE = "Asia/Bangkok";
const percent = (part: number, total: number) => (total === 0 ? 0 : Math.round((part * 100) / total));

/** Global admin report: the tenant registry is global; every child query remains scoped per organization. Q-0037. */
export async function adminAnalytics(ctx: RequestContext, input: AdminAnalyticsQuery): Promise<AdminAnalyticsResponse> {
  const db = getDb();
  const orgs = await db.select().from(organization);
  const start = new Date(localDayBounds({ date: input.from, timezone: TIMEZONE }).start);
  const end = new Date(localDayBounds({ date: input.to, timezone: TIMEZONE }).end);
  const seven = new Date(
    localDayBounds({ date: new Date(Date.parse(input.to) - 6 * 86_400_000).toISOString().slice(0, 10), timezone: TIMEZONE }).start,
  );
  const within = (at: Date | null) => at !== null && at >= start && at < end;
  return {
    orgs: await Promise.all(
      orgs.map(async (org) => {
        const repo = tenantDb({ ...ctx, orgId: org.id }, db);
        const rows = async <T extends TenantTable>(table: T) => (await repo.select(table)) as T["$inferSelect"][];
        const [bookings, bills, appointments, stays, visits, messages, cards, branches, sessions] = await Promise.all([
          rows(booking),
          rows(bill),
          rows(groomAppointment),
          rows(stay),
          rows(daycareVisit),
          rows(notification),
          rows(reportCard),
          rows(branch),
          rows(daycareSessionType),
        ]);
        const hours = branches.length
          ? await db
              .select()
              .from(branchHours)
              .where(
                inArray(
                  branchHours.branchId,
                  branches.map((b) => b.id),
                ),
              )
          : [];
        const bookingsByChannel = Object.fromEntries(bookingChannelValues.map((channel) => [channel, 0])) as Record<BookingChannel, number>;
        for (const b of bookings) if (within(b.createdAt)) bookingsByChannel[b.channel]++;
        const totalBookings = Object.values(bookingsByChannel).reduce((a, b) => a + b, 0);
        const activeDates = new Set(
          [...bookings, ...bills]
            .filter((r) => r.createdAt >= seven && r.createdAt < end)
            .map((r) => toLocalDate({ instant: r.createdAt.toISOString(), timezone: TIMEZONE })),
        );
        const due: { status: string; at: Date }[] = appointments.map((a) => ({ status: a.status, at: a.startsAt }));
        for (const s of stays) {
          const b = branches.find((br) => br.id === s.branchId);
          const weekday = new Date(`${s.checkInDate}T00:00:00Z`).getUTCDay();
          const time = s.expectedCheckInTime ?? hours.find((h) => h.branchId === s.branchId && h.weekday === weekday)?.opensAt;
          if (b && time)
            due.push({ status: s.status, at: new Date(localToUtc({ date: s.checkInDate, time: time.slice(0, 5), timezone: b.timezone })) });
        }
        for (const v of visits) {
          const b = branches.find((br) => br.id === v.branchId);
          const session = sessions.find((s) => s.id === v.sessionTypeId);
          if (b && session)
            due.push({
              status: v.status,
              at: new Date(localToUtc({ date: v.visitDate, time: session.startsAt.slice(0, 5), timezone: b.timezone })),
            });
        }
        const reached = due.filter((d) => d.status !== "cancelled" && within(d.at) && d.at <= ctx.now);
        return {
          orgId: org.id,
          activeDays7: activeDates.size,
          bookingsByChannel,
          onlineShare: percent(bookingsByChannel.line_liff + bookingsByChannel.booking_link, totalBookings),
          noShowRate: percent(reached.filter((d) => d.status === "no_show").length, reached.length),
          pushUsed: messages.filter((m) => m.channel === "line_push" && m.status === "sent" && within(m.sentAt)).length,
          reportCardsSent: cards.filter((c) => c.status === "sent" && within(c.sentAt)).length,
          billsClosed: bills.filter((b) => b.status === "paid" && within(b.closedAt)).length,
        };
      }),
    ),
  };
}
