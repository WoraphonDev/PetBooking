import {
  branchClosure,
  branchHours,
  branchPolicy,
  groomAppointment,
  groomStation,
  staffTimeOff,
  staffUser,
  staffWorkingHours,
} from "@app/db/schema";
import { computeGroomSlots } from "@app/domain/availability/groom-slots";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, eq, gt, lt, ne, notInArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import type { Executor } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const MINUTE = 60_000;
/** statuses the DB exclusion constraints ignore (groom_appt_*_no_overlap) */
const RELEASED = ["cancelled", "no_show"] as const;
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

/** A groomer + station hold not saved yet (e.g. an earlier item of the same booking). */
export type PendingAppointment = { groomerId: string; stationId: string; startsAt: string; blockedUntil: string };

export type GroomDaySlotsInput = {
  /** the org-checked branch (scopedBranch) */
  branch: { id: string; timezone: string };
  date: string;
  channel: "staff" | "online";
  durationMinutes: number;
  /** a specific groomer, else "any" */
  groomerId?: string | null;
  excludeAppointmentId?: string | null;
  pendingAppointments?: PendingAppointment[];
};

export type GroomDaySlots = {
  reason: "ok" | "closed" | "past" | "beyond_horizon" | "day_full" | "no_capacity";
  slots: { startsAt: string; endsAt: string; groomerId: string; groomerName: string; stationId: string }[];
};

/**
 * R-04 for one branch day (Q-1046): loads hours, policy, closures, active stations, active groomers with their working
 * hours and time off, and the day's live appointments, then runs computeGroomSlots. Shared by availability.groomSlots
 * (staff), liff.groomSlots (online) and booking creation, which passes the items it has already placed as
 * pendingAppointments. An unknown or inactive groomerId → NOT_FOUND. groomerName = staff_user.display_name.
 */
export async function groomDaySlots(ctx: RequestContext, db: Executor, input: GroomDaySlotsInput): Promise<GroomDaySlots> {
  const tdb = tenantDb(ctx, db);
  const { branch: b } = input;
  const day = localDayBounds({ date: input.date, timezone: b.timezone });
  const dayStart = new Date(day.start);
  const dayEnd = new Date(day.end);
  const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay();
  // branch_hours / branch_policy / branch_closure are keyed by the org-checked branch
  const [hours] = await db
    .select()
    .from(branchHours)
    .where(and(eq(branchHours.branchId, b.id), eq(branchHours.weekday, weekday)));
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id));
  const closures = await db
    .select()
    .from(branchClosure)
    .where(and(eq(branchClosure.branchId, b.id), lt(branchClosure.startsAt, dayEnd), gt(branchClosure.endsAt, dayStart)));
  const stations = (await tdb
    .select(groomStation, and(eq(groomStation.branchId, b.id), eq(groomStation.status, "active")))
    .orderBy(asc(groomStation.sortOrder), asc(groomStation.id))) as (typeof groomStation.$inferSelect)[];
  const groomers = (await tdb.select(
    staffUser,
    and(eq(staffUser.isGroomer, true), eq(staffUser.status, "active")),
  )) as (typeof staffUser.$inferSelect)[];
  if (input.groomerId && !groomers.some((g) => g.id === input.groomerId)) throw new AppError("NOT_FOUND");
  const working = (await tdb.select(
    staffWorkingHours,
    and(eq(staffWorkingHours.branchId, b.id), eq(staffWorkingHours.weekday, weekday)),
  )) as (typeof staffWorkingHours.$inferSelect)[];
  const timeOff = (await tdb.select(
    staffTimeOff,
    and(lt(staffTimeOff.startsAt, dayEnd), gt(staffTimeOff.endsAt, dayStart)),
  )) as (typeof staffTimeOff.$inferSelect)[];
  const appointments = (await tdb.select(
    groomAppointment,
    and(
      eq(groomAppointment.branchId, b.id),
      notInArray(groomAppointment.status, [...RELEASED]),
      lt(groomAppointment.startsAt, dayEnd),
      gt(groomAppointment.blockedUntil, dayStart),
      ...(input.excludeAppointmentId ? [ne(groomAppointment.id, input.excludeAppointmentId)] : []),
    ),
  )) as (typeof groomAppointment.$inferSelect)[];

  const result = computeGroomSlots({
    date: input.date,
    timezone: b.timezone,
    now: ctx.now.toISOString(),
    channel: input.channel,
    policy: {
      slotStepMinutes: policy?.slotStepMinutes ?? 15,
      bufferMinutes: policy?.bufferMinutes ?? 10,
      bookingLeadMinutes: policy?.bookingLeadMinutes ?? 120,
      bookingHorizonDays: policy?.bookingHorizonDays ?? 60,
      maxAppointmentsPerDay: policy?.maxAppointmentsPerDay ?? null,
      maxAppointmentsPerGroomerDay: policy?.maxAppointmentsPerGroomerDay ?? null,
    },
    branchHours: hours
      ? { isClosed: hours.isClosed, opensAt: hhmm(hours.opensAt), closesAt: hhmm(hours.closesAt) }
      : { isClosed: true, opensAt: null, closesAt: null },
    closures: closures.map((c) => ({ startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), scope: c.scope })),
    stationIds: stations.map((s) => s.id),
    groomers: groomers.map((g) => {
      const w = working.find((x) => x.staffUserId === g.id);
      return {
        id: g.id,
        sortOrder: g.sortOrder,
        workingHours: w
          ? {
              startsAt: w.startsAt.slice(0, 5),
              endsAt: w.endsAt.slice(0, 5),
              breakStartsAt: hhmm(w.breakStartsAt),
              breakEndsAt: hhmm(w.breakEndsAt),
            }
          : null,
        timeOff: timeOff
          .filter((t) => t.staffUserId === g.id)
          .map((t) => ({ startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString() })),
      };
    }),
    appointments: [
      ...appointments.map((a) => ({
        groomerId: a.groomerId,
        stationId: a.stationId,
        startsAt: a.startsAt.toISOString(),
        blockedUntil: a.blockedUntil.toISOString(),
      })),
      ...(input.pendingAppointments ?? []),
    ],
    durationMinutes: input.durationMinutes,
    groomerPreference: input.groomerId ? { type: "specific", groomerId: input.groomerId } : { type: "any" },
  });

  const nameOf = new Map(groomers.map((g) => [g.id, g.displayName]));
  return {
    reason: result.reason,
    slots: result.slots.map((s) => ({
      startsAt: s.startsAt,
      endsAt: new Date(Date.parse(s.startsAt) + input.durationMinutes * MINUTE).toISOString(),
      groomerId: s.groomerId,
      groomerName: nameOf.get(s.groomerId) ?? "",
      stationId: s.stationId,
    })),
  };
}
