import type { AffectedServiceItem } from "@app/contracts/dto/affected-service-item";
import { BranchSetHoursRequest, type BranchSetHoursResponse } from "@app/contracts/endpoints/branch.setHours";
import { booking, type branch, branchHours, customer, daycareVisit, groomAppointment, ownerProfile, pet, stay } from "@app/db/schema";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, gte, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchRow, branchSettings } from "./get.ts";

type Row = Omit<AffectedServiceItem, "bookingNo" | "petName" | "customerName"> & { petId: string };
// These values are local calendar dates, so UTC arithmetic only advances the calendar, not the branch's instants.
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
async function affected(
  ctx: RequestContext,
  tx: Tx,
  scoped: typeof branch.$inferSelect,
  input: BranchSetHoursRequest,
): Promise<AffectedServiceItem[]> {
  const db = tenantDb(ctx, tx);
  const tz = scoped.timezone;
  const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: tz });
  const hours = new Map(input.hours.map((h) => [h.weekday, h]));
  const hoursFor = (date: string) => {
    const h = hours.get(weekday(date));
    if (!h) throw new AppError("VALIDATION_FAILED");
    return h;
  };
  const closed = (date: string) => hoursFor(date).isClosed;
  const rows: Row[] = [];
  const appointments = (await db.select(
    groomAppointment,
    and(
      eq(groomAppointment.branchId, scoped.id),
      inArray(groomAppointment.status, ["scheduled", "checked_in", "in_progress"]),
      gt(groomAppointment.endsAt, ctx.now),
    ),
  )) as (typeof groomAppointment.$inferSelect)[];
  for (const a of appointments) {
    const startsAt = a.startsAt.toISOString();
    const date = toLocalDate({ instant: startsAt, timezone: tz });
    const h = hoursFor(date);
    if (!h.isClosed && (!h.opensAt || !h.closesAt)) throw new AppError("VALIDATION_FAILED");
    const outside =
      h.isClosed ||
      a.startsAt.getTime() < Date.parse(localToUtc({ date, time: h.opensAt ?? "00:00", timezone: tz })) ||
      a.endsAt.getTime() > Date.parse(localToUtc({ date, time: h.closesAt ?? "00:00", timezone: tz }));
    if (outside) rows.push({ module: "grooming", bookingId: a.bookingId, itemId: a.id, petId: a.petId, startsAt, date });
  }
  const stays = (await db.select(
    stay,
    and(eq(stay.branchId, scoped.id), inArray(stay.status, ["reserved", "checked_in"]), gt(stay.checkOutDate, today)),
  )) as (typeof stay.$inferSelect)[];
  for (const s of stays) {
    const first = s.checkInDate > today ? s.checkInDate : today;
    const cursor = new Date(`${first}T00:00:00Z`);
    let hit = false;
    // The weekly schedule repeats: checking up to seven occupied days covers even long stays.
    for (let n = 0; n < 7 && cursor.toISOString().slice(0, 10) < s.checkOutDate; n++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (closed(cursor.toISOString().slice(0, 10))) {
        hit = true;
        break;
      }
    }
    if (hit) rows.push({ module: "hotel", bookingId: s.bookingId, itemId: s.id, petId: s.petId, startsAt: null, date: s.checkInDate });
  }
  const visits = (await db.select(
    daycareVisit,
    and(eq(daycareVisit.branchId, scoped.id), inArray(daycareVisit.status, ["reserved", "checked_in"]), gte(daycareVisit.visitDate, today)),
  )) as (typeof daycareVisit.$inferSelect)[];
  for (const v of visits)
    if (closed(v.visitDate))
      rows.push({ module: "daycare", bookingId: v.bookingId, itemId: v.id, petId: v.petId, startsAt: null, date: v.visitDate });
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

export async function branchSetHours(ctx: RequestContext, input: BranchSetHoursRequest): Promise<BranchSetHoursResponse> {
  requireRole(ctx, "branch.setHours");
  const parsed = BranchSetHoursRequest.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED");
  return withTx(ctx, async (tx) => {
    const scoped = await branchRow(ctx, tx);
    // Child hours rows have no org key; access only through the tenant-checked parent.
    await tx.delete(branchHours).where(eq(branchHours.branchId, scoped.id));
    await tx.insert(branchHours).values(
      parsed.data.hours.map((h) => ({
        branchId: scoped.id,
        weekday: h.weekday,
        isClosed: h.isClosed,
        opensAt: h.isClosed ? null : (h.opensAt ?? null),
        closesAt: h.isClosed ? null : (h.closesAt ?? null),
      })),
    );
    const items = await affected(ctx, tx, scoped, parsed.data);
    return {
      ...(await branchSettings(ctx, tx)),
      warnings: items.length
        ? [{ code: "BRANCH_HOURS_AFFECTED" as const, message: "มีรายการจองอยู่นอกเวลาเปิดทำการใหม่" as const, data: { items } }]
        : [],
    };
  });
}
