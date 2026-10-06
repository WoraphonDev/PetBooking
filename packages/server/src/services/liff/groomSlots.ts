import type { LiffGroomSlotsRequest, LiffGroomSlotsResponse } from "@app/contracts/endpoints/liff.groomSlots";
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
import { and, asc, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId, scopedBranch, shopPet } from "../availability/hotel.ts";
import { requireMyPet } from "./pets.ts";

const MINUTE = 60_000;
/** statuses the DB exclusion constraints ignore (groom_appt_*_no_overlap) */
const RELEASED = ["cancelled", "no_show"] as const;
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

/**
 * 05#ep-liff.groomSlots: R-04 slots on the `online` channel (lead time + horizon) for one of the customer's own pets, with
 * R-02/R-03 price and duration. Same day inputs as availability.groomSlots (staff), plus the customer rules (Q-1046):
 * grooming module off → MODULE_DISABLED; another customer's pet → NOT_FOUND; blacklisted customer (R-12 step 1) →
 * CUSTOMER_BLACKLISTED; services must be active, online_bookable grooming services (mains not add-ons, add-ons add-ons);
 * the customer's size choice only counts while the pet has no weight (else R-01 from the weight), none → WEIGHT_REQUIRED.
 * groomerName = staff_user.display_name. Rate limit 30/min/user comes from the route wrapper (ruleFor liff.groomSlots).
 */
export async function liffGroomSlots(ctx: RequestContext, input: LiffGroomSlotsRequest): Promise<LiffGroomSlotsResponse> {
  const db = getDb();
  const tdb = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  await requireMyPet(ctx, db, input.petId);
  const subject = await shopPet(ctx, db, b.id, input.petId);
  if (subject.blacklisted) throw new AppError("CUSTOMER_BLACKLISTED");

  const ids = [...new Set([...input.serviceIds, ...input.addonIds])];
  const services = (await tdb.select(
    service,
    and(eq(service.branchId, b.id), inArray(service.id, ids)),
  )) as (typeof service.$inferSelect)[];
  if (services.length !== ids.length) throw new AppError("NOT_FOUND");
  const fields: Record<string, string> = {};
  const bookable = (s: (typeof services)[number] | undefined, addon: boolean) =>
    s && s.scope === "grooming" && s.isAddon === addon && s.status === "active" && s.onlineBookable;
  input.serviceIds.forEach((id, i) => {
    if (
      !bookable(
        services.find((x) => x.id === id),
        false,
      )
    )
      fields[`serviceIds.${i}`] = "must be an online-bookable main grooming service";
  });
  input.addonIds.forEach((id, i) => {
    if (
      !bookable(
        services.find((x) => x.id === id),
        true,
      )
    )
      fields[`addonIds.${i}`] = "must be an online-bookable grooming add-on";
  });
  if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

  // R-01: from the weight; the customer's own size choice only when the pet has no weight
  let tierId = subject.tierId;
  if (subject.row.species !== "other" && subject.row.latestWeightGrams === null) {
    if (!input.sizeTierId) throw new AppError("WEIGHT_REQUIRED");
    const [tier] = await tdb.select(sizeTier, and(eq(sizeTier.branchId, b.id), eq(sizeTier.id, input.sizeTierId)));
    if (!tier) throw new AppError("NOT_FOUND");
    tierId = input.sizeTierId;
  }

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
    ),
  )) as (typeof groomAppointment.$inferSelect)[];

  const result = computeGroomSlots({
    date: input.date,
    timezone: b.timezone,
    now: ctx.now.toISOString(),
    channel: "online",
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
    appointments: appointments.map((a) => ({
      groomerId: a.groomerId,
      stationId: a.stationId,
      startsAt: a.startsAt.toISOString(),
      blockedUntil: a.blockedUntil.toISOString(),
    })),
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
