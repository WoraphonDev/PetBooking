import type { AffectedServiceItem } from "@app/contracts/dto/affected-service-item";
import type { TimeOffCreateRequest, TimeOffCreateResponse } from "@app/contracts/endpoints/timeOff.create";
import { booking, branch, customer, groomAppointment, ownerProfile, pet, staffTimeOff, staffUser } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const OPEN_GROOM = ["scheduled", "checked_in", "in_progress"] as const;

/** The groomer's unfinished appointments in this branch overlapping [startsAt, endsAt) (05#ep-timeOff.create, Q-0028). */
async function findAffected(
  ctx: RequestContext,
  tx: Tx,
  scoped: typeof branch.$inferSelect,
  input: { staffUserId: string; startsAt: Date; endsAt: Date },
): Promise<AffectedServiceItem[]> {
  const db = tenantDb(ctx, tx);
  const appts = (await db.select(
    groomAppointment,
    and(
      eq(groomAppointment.branchId, scoped.id),
      eq(groomAppointment.groomerId, input.staffUserId),
      inArray(groomAppointment.status, [...OPEN_GROOM]),
      lt(groomAppointment.startsAt, input.endsAt),
      gt(groomAppointment.endsAt, input.startsAt),
    ),
  )) as (typeof groomAppointment.$inferSelect)[];
  if (appts.length === 0) return [];

  const bookings = (await db.select(
    booking,
    inArray(booking.id, [...new Set(appts.map((a) => a.bookingId))]),
  )) as (typeof booking.$inferSelect)[];
  const customers = (await db.select(
    customer,
    inArray(customer.id, [...new Set(bookings.map((b) => b.customerId))]),
  )) as (typeof customer.$inferSelect)[];
  // pet / owner_profile are shared across organizations; reached through the tenant-checked rows above
  const pets = await tx
    .select({ id: pet.id, name: pet.name })
    .from(pet)
    .where(inArray(pet.id, [...new Set(appts.map((a) => a.petId))]));
  const owners = await tx
    .select({ id: ownerProfile.id, firstName: ownerProfile.firstName, nickname: ownerProfile.nickname })
    .from(ownerProfile)
    .where(inArray(ownerProfile.id, [...new Set(customers.map((c) => c.ownerProfileId))]));

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const ownerByCustomer = new Map(customers.map((c) => [c.id, owners.find((o) => o.id === c.ownerProfileId)]));
  const petName = new Map(pets.map((p) => [p.id, p.name]));
  return appts
    .map((a): AffectedServiceItem => {
      const b = bookingById.get(a.bookingId);
      const owner = b ? ownerByCustomer.get(b.customerId) : undefined;
      const startsAt = a.startsAt.toISOString();
      return {
        module: "grooming",
        bookingId: a.bookingId,
        bookingNo: b?.bookingNo ?? "",
        itemId: a.id,
        petName: petName.get(a.petId) ?? "",
        // 06 display: ชื่อ (ชื่อเล่น)
        customerName: owner ? (owner.nickname ? `${owner.firstName} (${owner.nickname})` : owner.firstName) : "",
        startsAt,
        date: toLocalDate({ instant: startsAt, timezone: scoped.timezone }),
      };
    })
    .sort(
      (x, y) =>
        (x.startsAt ?? "").localeCompare(y.startsAt ?? "") || x.bookingNo.localeCompare(y.bookingNo) || x.itemId.localeCompare(y.itemId),
    );
}

export async function timeOffCreate(ctx: RequestContext, input: TimeOffCreateRequest): Promise<TimeOffCreateResponse> {
  requireRole(ctx, "timeOff.create");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    const [member] = await db.select(staffUser, eq(staffUser.id, input.staffUserId));
    if (!member) throw new AppError("NOT_FOUND");
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    await db.insert(staffTimeOff, {
      staffUserId: input.staffUserId,
      startsAt,
      endsAt,
      reason: input.reason ?? null,
      createdBy: ctx.actor.id,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    // appointments are not moved — the front desk reschedules them itself
    return { affected: await findAffected(ctx, tx, scopedBranch, { staffUserId: input.staffUserId, startsAt, endsAt }) };
  });
}
