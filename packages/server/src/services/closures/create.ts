import type { AffectedServiceItem } from "@app/contracts/dto/affected-service-item";
import type { ClosuresCreateRequest, ClosuresCreateResponse } from "@app/contracts/endpoints/closures.create";
import type { ClosureScope } from "@app/contracts/enums";
import { booking, branch, branchClosure, customer, daycareVisit, groomAppointment, ownerProfile, pet, stay } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const OPEN_GROOM = ["scheduled", "checked_in", "in_progress"] as const;
const OPEN_STAY = ["reserved", "checked_in"] as const;
const OPEN_DAYCARE = ["reserved", "checked_in"] as const;

type Row = Omit<AffectedServiceItem, "bookingNo" | "petName" | "customerName"> & { petId: string };

/** Unfinished items of the branch overlapping [startsAt, endsAt) for the closure scope (05#ep-closures.create, Q-0028). */
async function findAffected(
  ctx: RequestContext,
  tx: Tx,
  scoped: typeof branch.$inferSelect,
  input: { startsAt: Date; endsAt: Date; scope: ClosureScope },
): Promise<AffectedServiceItem[]> {
  const db = tenantDb(ctx, tx);
  const tz = scoped.timezone;
  // ends_at is exclusive: the last local day touched is the day of the last instant before it
  const firstDay = toLocalDate({ instant: input.startsAt.toISOString(), timezone: tz });
  const lastDay = toLocalDate({ instant: new Date(input.endsAt.getTime() - 1).toISOString(), timezone: tz });
  const hits = (m: ClosureScope) => input.scope === "all" || input.scope === m;
  const rows: Row[] = [];

  if (hits("grooming")) {
    const appts = (await db.select(
      groomAppointment,
      and(
        eq(groomAppointment.branchId, scoped.id),
        inArray(groomAppointment.status, [...OPEN_GROOM]),
        lt(groomAppointment.startsAt, input.endsAt),
        gt(groomAppointment.endsAt, input.startsAt),
      ),
    )) as (typeof groomAppointment.$inferSelect)[];
    for (const a of appts) {
      const startsAt = a.startsAt.toISOString();
      rows.push({
        module: "grooming",
        bookingId: a.bookingId,
        itemId: a.id,
        petId: a.petId,
        startsAt,
        date: toLocalDate({ instant: startsAt, timezone: tz }),
      });
    }
  }
  if (hits("hotel")) {
    // a night d (check_in_date ≤ d < check_out_date) falls on a closed local day
    const stays = (await db.select(
      stay,
      and(
        eq(stay.branchId, scoped.id),
        inArray(stay.status, [...OPEN_STAY]),
        lte(stay.checkInDate, lastDay),
        gt(stay.checkOutDate, firstDay),
      ),
    )) as (typeof stay.$inferSelect)[];
    for (const s of stays)
      rows.push({ module: "hotel", bookingId: s.bookingId, itemId: s.id, petId: s.petId, startsAt: null, date: s.checkInDate });
  }
  if (hits("daycare")) {
    const visits = (await db.select(
      daycareVisit,
      and(
        eq(daycareVisit.branchId, scoped.id),
        inArray(daycareVisit.status, [...OPEN_DAYCARE]),
        gte(daycareVisit.visitDate, firstDay),
        lte(daycareVisit.visitDate, lastDay),
      ),
    )) as (typeof daycareVisit.$inferSelect)[];
    for (const v of visits)
      rows.push({ module: "daycare", bookingId: v.bookingId, itemId: v.id, petId: v.petId, startsAt: null, date: v.visitDate });
  }
  if (rows.length === 0) return [];

  const bookings = (await db.select(
    booking,
    inArray(booking.id, [...new Set(rows.map((r) => r.bookingId))]),
  )) as (typeof booking.$inferSelect)[];
  const customers = (await db.select(
    customer,
    inArray(customer.id, [...new Set(bookings.map((b) => b.customerId))]),
  )) as (typeof customer.$inferSelect)[];
  // pet / owner_profile are shared across organizations; reached through the tenant-checked rows above
  const pets = await tx
    .select({ id: pet.id, name: pet.name })
    .from(pet)
    .where(inArray(pet.id, [...new Set(rows.map((r) => r.petId))]));
  const owners = await tx
    .select({ id: ownerProfile.id, firstName: ownerProfile.firstName, nickname: ownerProfile.nickname })
    .from(ownerProfile)
    .where(inArray(ownerProfile.id, [...new Set(customers.map((c) => c.ownerProfileId))]));

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const ownerByCustomer = new Map(customers.map((c) => [c.id, owners.find((o) => o.id === c.ownerProfileId)]));
  const petName = new Map(pets.map((p) => [p.id, p.name]));
  const items = rows.map(({ petId, ...r }): AffectedServiceItem => {
    const b = bookingById.get(r.bookingId);
    const owner = b ? ownerByCustomer.get(b.customerId) : undefined;
    return {
      ...r,
      bookingNo: b?.bookingNo ?? "",
      petName: petName.get(petId) ?? "",
      // 06 display: ชื่อ (ชื่อเล่น)
      customerName: owner ? (owner.nickname ? `${owner.firstName} (${owner.nickname})` : owner.firstName) : "",
    };
  });
  return items.sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      (x.startsAt === y.startsAt ? 0 : x.startsAt === null ? 1 : y.startsAt === null ? -1 : x.startsAt.localeCompare(y.startsAt)) ||
      x.bookingNo.localeCompare(y.bookingNo) ||
      x.itemId.localeCompare(y.itemId),
  );
}

export async function closuresCreate(ctx: RequestContext, input: ClosuresCreateRequest): Promise<ClosuresCreateResponse> {
  requireRole(ctx, "closures.create");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const [scopedBranch] = (await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    // branch_closure is a child of the tenant-checked branch above.
    await tx.insert(branchClosure).values({
      branchId: scopedBranch.id,
      startsAt,
      endsAt,
      scope: input.scope,
      source: "manual",
      reason: input.reason ?? null,
      createdBy: ctx.actor.id,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    // nothing is cancelled or moved — the front desk handles the affected items itself
    return { affected: await findAffected(ctx, tx, scopedBranch, { startsAt, endsAt, scope: input.scope }) };
  });
}
