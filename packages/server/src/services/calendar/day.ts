import type { CalendarDay } from "@app/contracts/dto/calendar-day";
import type { CalendarDayRequest, CalendarDayResponse } from "@app/contracts/endpoints/calendar.day";
import {
  booking,
  branch,
  branchClosure,
  branchHours,
  daycareVisit,
  groomAppointment,
  groomStation,
  paymentSlip,
  staffTimeOff,
  staffUser,
  staffWorkingHours,
  stay,
} from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, eq, gt, gte, inArray, lt, ne } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { appointmentCards } from "../bookings/get.ts";

type BranchRow = typeof branch.$inferSelect;
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));
const iso = (d: Date) => d.toISOString();
/** closures that affect the grooming calendar */
const GROOM_SCOPES = ["all", "grooming"] as const;

/** `date` + n days as YYYY-MM-DD (calendar arithmetic on the local date, no timezone involved) */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Grooming calendar of one day, or of 7 days from `date` (05#ep-calendar.day). */
export async function calendarDay(ctx: RequestContext, input: CalendarDayRequest): Promise<CalendarDayResponse> {
  requireRole(ctx, "calendar.day");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [br] = (await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId))) as BranchRow[];
  if (!br) throw new AppError("NOT_FOUND");

  const groomers = (await tenantDb(ctx, db)
    .select(staffUser, and(eq(staffUser.isGroomer, true), eq(staffUser.status, "active")))
    .orderBy(asc(staffUser.displayName), asc(staffUser.id))) as (typeof staffUser.$inferSelect)[];
  if (input.groomerId && !groomers.some((g) => g.id === input.groomerId)) throw new AppError("NOT_FOUND");
  const shown = input.groomerId ? groomers.filter((g) => g.id === input.groomerId) : groomers;

  // counts that do not depend on the day
  const tdb = tenantDb(ctx, db);
  const pendingApprovals = (await tdb.select(booking, and(eq(booking.branchId, br.id), eq(booking.status, "awaiting_approval")))).length;
  const pendingSlips = (await tdb.select(paymentSlip, and(eq(paymentSlip.branchId, br.id), eq(paymentSlip.status, "submitted")))).length;
  const inHouse = (await tdb.select(stay, and(eq(stay.branchId, br.id), eq(stay.status, "checked_in")))).length;

  const days = input.view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(input.date, i)) : [input.date];
  const result: CalendarDay[] = [];
  for (const date of days) {
    result.push({
      ...(await oneDay(ctx, db, br, shown, date, input.groomerId)),
      hotel: await hotelCounts(ctx, db, br.id, date, inHouse),
      daycare: { count: await daycareCount(ctx, db, br.id, date) },
      pendingApprovals,
      pendingSlips,
    });
  }
  return input.view === "week" ? result : (result[0] as CalendarDay);
}

async function oneDay(
  ctx: RequestContext,
  db: Executor,
  br: BranchRow,
  groomers: (typeof staffUser.$inferSelect)[],
  date: string,
  groomerId: string | undefined,
): Promise<Pick<CalendarDay, "date" | "opensAt" | "closesAt" | "groomers" | "stations" | "closures" | "appointments">> {
  const tdb = tenantDb(ctx, db);
  const bounds = localDayBounds({ date, timezone: br.timezone });
  const [start, end] = [new Date(bounds.start), new Date(bounds.end)];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const groomerIds = groomers.map((g) => g.id);

  const [hours] = await db
    .select()
    .from(branchHours)
    .where(and(eq(branchHours.branchId, br.id), eq(branchHours.weekday, weekday)));
  const open = hours && !hours.isClosed;
  const working = groomerIds.length
    ? ((await tdb.select(
        staffWorkingHours,
        and(
          eq(staffWorkingHours.branchId, br.id),
          eq(staffWorkingHours.weekday, weekday),
          inArray(staffWorkingHours.staffUserId, groomerIds),
        ),
      )) as (typeof staffWorkingHours.$inferSelect)[])
    : [];
  const timeOff = groomerIds.length
    ? ((await tdb
        .select(
          staffTimeOff,
          and(inArray(staffTimeOff.staffUserId, groomerIds), lt(staffTimeOff.startsAt, end), gt(staffTimeOff.endsAt, start)),
        )
        .orderBy(asc(staffTimeOff.startsAt), asc(staffTimeOff.id))) as (typeof staffTimeOff.$inferSelect)[])
    : [];
  const stations = (await tdb
    .select(groomStation, and(eq(groomStation.branchId, br.id), eq(groomStation.status, "active")))
    .orderBy(asc(groomStation.sortOrder), asc(groomStation.id))) as (typeof groomStation.$inferSelect)[];
  const closures = await db
    .select()
    .from(branchClosure)
    .where(
      and(
        eq(branchClosure.branchId, br.id),
        inArray(branchClosure.scope, [...GROOM_SCOPES]),
        lt(branchClosure.startsAt, end),
        gt(branchClosure.endsAt, start),
      ),
    )
    .orderBy(asc(branchClosure.startsAt), asc(branchClosure.id));
  const appts = (await tdb
    .select(
      groomAppointment,
      and(
        eq(groomAppointment.branchId, br.id),
        ne(groomAppointment.status, "cancelled"),
        gte(groomAppointment.startsAt, start),
        lt(groomAppointment.startsAt, end),
        ...(groomerId ? [eq(groomAppointment.groomerId, groomerId)] : []),
      ),
    )
    .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as (typeof groomAppointment.$inferSelect)[];
  const cards = await appointmentCards(ctx, db, appts);
  // role staff sees every appointment but not the customer's phone (05#ep-calendar.day)
  const appointments = ctx.actor.role === "staff" ? cards.map((c) => ({ ...c, customerPhone: null })) : cards;

  return {
    date,
    opensAt: open ? hhmm(hours.opensAt) : null,
    closesAt: open ? hhmm(hours.closesAt) : null,
    groomers: groomers.map((g) => {
      const wh = working.find((w) => w.staffUserId === g.id);
      return {
        id: g.id,
        displayName: g.displayName,
        workingHours: wh
          ? {
              weekday: wh.weekday,
              startsAt: hhmm(wh.startsAt) as string,
              endsAt: hhmm(wh.endsAt) as string,
              breakStartsAt: hhmm(wh.breakStartsAt),
              breakEndsAt: hhmm(wh.breakEndsAt),
            }
          : null,
        timeOff: timeOff
          .filter((t) => t.staffUserId === g.id)
          .map((t) => ({
            id: t.id,
            organizationId: t.organizationId,
            staffUserId: t.staffUserId,
            startsAt: iso(t.startsAt),
            endsAt: iso(t.endsAt),
            reason: t.reason,
            createdBy: t.createdBy,
            createdAt: iso(t.createdAt),
            updatedAt: iso(t.updatedAt),
          })),
      };
    }),
    stations: stations.map((s) => ({ id: s.id, name: s.name })),
    closures: closures.map((c) => ({
      id: c.id,
      branchId: c.branchId,
      startsAt: iso(c.startsAt),
      endsAt: iso(c.endsAt),
      scope: c.scope,
      source: c.source,
      reason: c.reason,
      createdBy: c.createdBy,
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
    })),
    appointments,
  };
}

/** arrivals / departures on `date`; inHouse = stays checked in now (05#dto-CalendarDay) */
async function hotelCounts(ctx: RequestContext, db: Executor, branchId: string, date: string, inHouse: number) {
  const stays = (await tenantDb(ctx, db).select(
    stay,
    and(eq(stay.branchId, branchId), ne(stay.status, "cancelled")),
  )) as (typeof stay.$inferSelect)[];
  return {
    arrivals: stays.filter((s) => s.checkInDate === date).length,
    departures: stays.filter((s) => s.checkOutDate === date).length,
    inHouse,
  };
}

async function daycareCount(ctx: RequestContext, db: Executor, branchId: string, date: string): Promise<number> {
  const visits = await tenantDb(ctx, db).select(
    daycareVisit,
    and(eq(daycareVisit.branchId, branchId), eq(daycareVisit.visitDate, date), ne(daycareVisit.status, "cancelled")),
  );
  return visits.length;
}
