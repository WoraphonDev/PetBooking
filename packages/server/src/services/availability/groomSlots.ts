import type { AvailabilityGroomSlotsRequest, AvailabilityGroomSlotsResponse } from "@app/contracts/endpoints/availability.groomSlots";
import {
  branchClosure,
  branchHours,
  branchPolicy,
  groomAppointment,
  groomStation,
  service,
  servicePrice,
  sizeTier,
  staffTimeOff,
  staffUser,
  staffWorkingHours,
} from "@app/db/schema";
import { computeGroomSlots } from "@app/domain/availability/groom-slots";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, eq, gt, inArray, lt, ne, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId, scopedBranch, shopPet } from "./hotel.ts";

const MINUTE = 60_000;
/** statuses the DB exclusion constraints ignore (groom_appt_*_no_overlap) */
const RELEASED = ["cancelled", "no_show"] as const;
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

/** R-04 slots for one pet on one day, with R-02/R-03 price and duration (05#ep-availability.groomSlots). */
export async function availabilityGroomSlots(
  ctx: RequestContext,
  input: AvailabilityGroomSlotsRequest,
): Promise<AvailabilityGroomSlotsResponse> {
  requireRole(ctx, "availability.groomSlots");
  const db = getDb();
  const tdb = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  const subject = await shopPet(ctx, db, b.id, input.petId);

  // services: main ones in serviceIds, add-ons in addonIds — all active grooming services of this branch
  const ids = [...new Set([...input.serviceIds, ...input.addonIds])];
  const services = (await tdb.select(
    service,
    and(eq(service.branchId, b.id), inArray(service.id, ids)),
  )) as (typeof service.$inferSelect)[];
  if (services.length !== ids.length) throw new AppError("NOT_FOUND");
  const fields: Record<string, string> = {};
  input.serviceIds.forEach((id, i) => {
    const s = services.find((x) => x.id === id);
    if (s && (s.scope !== "grooming" || s.isAddon || s.status !== "active"))
      fields[`serviceIds.${i}`] = "must be an active main grooming service";
  });
  input.addonIds.forEach((id, i) => {
    const s = services.find((x) => x.id === id);
    if (s && (s.scope !== "grooming" || !s.isAddon || s.status !== "active")) fields[`addonIds.${i}`] = "must be an active grooming add-on";
  });
  if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

  // R-01: shop override, else from weight
  let tierId = subject.tierId;
  if (input.sizeTierId) {
    const [tier] = await tdb.select(sizeTier, and(eq(sizeTier.branchId, b.id), eq(sizeTier.id, input.sizeTierId)));
    if (!tier) throw new AppError("NOT_FOUND");
    tierId = input.sizeTierId;
  } else if (subject.row.species !== "other" && subject.row.latestWeightGrams === null) throw new AppError("WEIGHT_REQUIRED");

  // R-02 per service on the default plan; R-03 sums
  const planId = await defaultPlanId(ctx, db, b.id);
  const prices = planId
    ? ((await tdb.select(
        servicePrice,
        and(eq(servicePrice.ratePlanId, planId), inArray(servicePrice.serviceId, ids)),
      )) as (typeof servicePrice.$inferSelect)[])
    : [];
  const coatGroup = coatGroupOf({ coatType: subject.row.coatType });
  let priceSatang = 0;
  let durationMinutes = 0;
  for (const serviceId of [...input.serviceIds, ...input.addonIds]) {
    const found = lookupServicePrice({ serviceId, sizeTierId: tierId, coatGroup, prices });
    if (!found) throw new AppError("PRICE_NOT_FOUND");
    priceSatang += found.priceSatang;
    durationMinutes += found.durationMinutes;
  }

  // the local day and its inputs
  const day = localDayBounds({ date: input.date, timezone: b.timezone });
  const dayStart = new Date(day.start);
  const dayEnd = new Date(day.end);
  const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay();
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
    channel: "staff",
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
      ...input.pendingAppointments,
    ],
    durationMinutes,
    groomerPreference: input.groomerId ? { type: "specific", groomerId: input.groomerId } : { type: "any" },
  });

  const nameOf = new Map(groomers.map((g) => [g.id, g.displayName]));
  return {
    date: input.date,
    reason: result.reason,
    slots: result.slots.map((s) => ({
      startsAt: s.startsAt,
      endsAt: new Date(Date.parse(s.startsAt) + durationMinutes * MINUTE).toISOString(),
      groomerId: s.groomerId,
      groomerName: nameOf.get(s.groomerId) ?? "",
      stationId: s.stationId,
    })),
    durationMinutes,
    priceSatang,
  };
}
