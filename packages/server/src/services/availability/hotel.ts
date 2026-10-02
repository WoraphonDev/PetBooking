import type { AvailabilityHotelRequest, AvailabilityHotelResponse } from "@app/contracts/endpoints/availability.hotel";
import {
  branch,
  branchClosure,
  branchPolicy,
  customer,
  pet,
  petTemperamentFlag,
  ratePlan,
  roomRate,
  roomType,
  roomUnit,
  sizeTier,
  stay,
} from "@app/db/schema";
import { hotelAvailability } from "@app/domain/availability/hotel-availability";
import { ageInMonths, checkEligibility } from "@app/domain/booking/eligibility";
import { resolveSizeTier } from "@app/domain/pricing/size-tier";
import { localDayBounds, toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const DAY_MS = 86_400_000;
/** stays that hold a room (R-28 input) */
const HOLDING = ["reserved", "checked_in"] as const;

/** the session branch, tenant-checked */
export async function scopedBranch(ctx: RequestContext, db: Executor) {
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const [row] = (await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** A pet of one of this shop's customers (pet is a shared table): row, this shop's flags and its R-01 size tier. */
export async function shopPet(ctx: RequestContext, db: Executor, branchId: string, petId: string) {
  const [row] = await db.select().from(pet).where(eq(pet.id, petId));
  if (!row) throw new AppError("NOT_FOUND");
  const [owner] = await tenantDb(ctx, db).select(customer, eq(customer.ownerProfileId, row.ownerProfileId));
  if (!owner) throw new AppError("NOT_FOUND");
  const flags = (await tenantDb(ctx, db).select(
    petTemperamentFlag,
    eq(petTemperamentFlag.petId, row.id),
  )) as (typeof petTemperamentFlag.$inferSelect)[];
  const tiers = (await tenantDb(ctx, db).select(sizeTier, eq(sizeTier.branchId, branchId))) as (typeof sizeTier.$inferSelect)[];
  const { tierId } = resolveSizeTier({
    species: row.species,
    weightGrams: row.latestWeightGrams,
    // size_tier rows are dog/cat only; R-01 skips "other" before looking at tiers
    tiers: tiers.flatMap((t) => (t.species === "other" ? [] : [{ ...t, species: t.species }])),
  });
  return { row, flags: flags.map((f) => f.flag as string), tierId, blacklisted: (owner as typeof customer.$inferSelect).blacklisted };
}

/** the branch's default rate plan — MVP prices live on that single plan (02#tbl-rate_plan) */
export async function defaultPlanId(ctx: RequestContext, db: Executor, branchId: string): Promise<string | null> {
  const [plan] = (await tenantDb(ctx, db).select(
    ratePlan,
    and(eq(ratePlan.branchId, branchId), eq(ratePlan.isDefault, true)),
  )) as (typeof ratePlan.$inferSelect)[];
  return plan?.id ?? null;
}

/** price for the pet's size tier, else the all-size row (size_tier_id null); without a pet only the all-size row applies */
export function pickPrice<T extends { sizeTierId: string | null }>(rows: T[], tierId: string | null): T | undefined {
  return (tierId ? rows.find((r) => r.sizeTierId === tierId) : undefined) ?? rows.find((r) => r.sizeTierId === null);
}

/** local dates from..to (inclusive) touched by a branch closure of the given scopes */
export async function closedDates(db: Executor, b: typeof branch.$inferSelect, dates: string[], scopes: ("all" | "hotel" | "daycare")[]) {
  if (dates.length === 0) return [];
  const bounds = dates.map((date) => ({ date, ...localDayBounds({ date, timezone: b.timezone }) }));
  const closures = await db
    .select()
    .from(branchClosure)
    .where(
      and(
        eq(branchClosure.branchId, b.id),
        inArray(branchClosure.scope, scopes),
        lt(branchClosure.startsAt, new Date(bounds[bounds.length - 1]?.end ?? "")),
        gt(branchClosure.endsAt, new Date(bounds[0]?.start ?? "")),
      ),
    );
  return bounds.filter((d) => closures.some((c) => c.startsAt < new Date(d.end) && new Date(d.start) < c.endsAt)).map((d) => d.date);
}

function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(checkIn); t < Date.parse(checkOut); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export async function availabilityHotel(ctx: RequestContext, input: AvailabilityHotelRequest): Promise<AvailabilityHotelResponse> {
  requireRole(ctx, "availability.hotel");
  const db = getDb();
  const b = await scopedBranch(ctx, db);
  const tdb = tenantDb(ctx, db);
  const subject = input.petId ? await shopPet(ctx, db, b.id, input.petId) : null;

  const types = (await tdb
    .select(roomType, and(eq(roomType.branchId, b.id), eq(roomType.status, "active")))
    .orderBy(asc(roomType.sortOrder), asc(roomType.nameTh), asc(roomType.id))) as (typeof roomType.$inferSelect)[];
  const units = (await tdb.select(roomUnit, eq(roomUnit.branchId, b.id))) as (typeof roomUnit.$inferSelect)[];
  const stays = (await tdb.select(
    stay,
    and(
      eq(stay.branchId, b.id),
      inArray(stay.status, [...HOLDING]),
      lt(stay.checkInDate, input.checkOutDate),
      gt(stay.checkOutDate, input.checkInDate),
    ),
  )) as (typeof stay.$inferSelect)[];
  const nights = nightsOf(input.checkInDate, input.checkOutDate);
  const closed = await closedDates(db, b, nights, ["all", "hotel"]);
  const planId = await defaultPlanId(ctx, db, b.id);
  const rates =
    planId && types.length
      ? ((await tdb.select(
          roomRate,
          and(
            eq(roomRate.ratePlanId, planId),
            inArray(
              roomRate.roomTypeId,
              types.map((t) => t.id),
            ),
          ),
        )) as (typeof roomRate.$inferSelect)[])
      : [];
  // branch_policy has no organization_id: read it through the tenant-checked branch
  const [policy] = subject ? await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id)) : [];
  const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: b.timezone });

  return {
    nights: nights.length,
    roomTypes: types.map((t) => {
      const r28 = hotelAvailability({
        roomTypeId: t.id,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        units,
        stays,
        closedDates: closed,
      });
      const eligibility = subject
        ? checkEligibility({
            channel: "staff",
            customer: { blacklisted: subject.blacklisted },
            pet: {
              status: subject.row.status,
              species: subject.row.species,
              breed: subject.row.breed,
              weightGrams: subject.row.latestWeightGrams,
              ageMonths: ageInMonths({
                onDate: today,
                birthDate: subject.row.birthDate,
                ageEstimateMonths: subject.row.ageEstimateMonths,
                estimateRecordedOn: toLocalDate({ instant: subject.row.createdAt.toISOString(), timezone: b.timezone }),
              }),
              flags: subject.flags,
            },
            policy: { rejectedBreeds: policy?.rejectedBreeds ?? [], maxPetWeightGrams: policy?.maxPetWeightGrams ?? null },
            speciesAllowed: t.speciesAllowed,
            roomType: {
              maxWeightGrams: t.maxWeightGrams,
              minAgeMonths: t.minAgeMonths,
              allowInHeat: t.allowInHeat,
              allowReactive: t.allowReactive,
            },
            inHeat: false,
          })
        : { ok: true, reasons: [] };
      return {
        roomTypeId: t.id,
        nameTh: t.nameTh,
        availableUnits: r28.availableUnits,
        nightlyPriceSatang:
          pickPrice(
            rates.filter((r) => r.roomTypeId === t.id),
            subject?.tierId ?? null,
          )?.nightlyPriceSatang ?? null,
        eligible: eligibility.ok,
        ineligibleReasons: eligibility.reasons,
      };
    }),
  };
}
