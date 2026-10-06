import type { MyBookingItem } from "@app/contracts/dto/my-booking-item";
import type { LiffBookingsRequest, LiffBookingsResponse } from "@app/contracts/endpoints/liff.bookings";
import {
  booking,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  pet,
  roomType,
  staffUser,
  stay,
} from "@app/db/schema";
import { customerSelfService } from "@app/domain/booking/self-service";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type BookingRow = typeof booking.$inferSelect;
const OPEN = ["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed"] as const;
const DONE = ["cancelled", "expired", "closed"] as const;

const unique = <T>(xs: T[]) => [...new Set(xs)];

/** A booking's grooming / stay / daycare lines with the names the customer sees (no staff-only data). */
export async function bookingLines(ctx: RequestContext, db: Executor, bk: BookingRow) {
  const repo = tenantDb(ctx, db);
  const appts = (await repo
    .select(groomAppointment, eq(groomAppointment.bookingId, bk.id))
    .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as (typeof groomAppointment.$inferSelect)[];
  const items = appts.length
    ? ((await repo
        .select(
          groomAppointmentItem,
          inArray(
            groomAppointmentItem.appointmentId,
            appts.map((a) => a.id),
          ),
        )
        .orderBy(asc(groomAppointmentItem.id))) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  const groomers = appts.length
    ? ((await repo.select(staffUser, inArray(staffUser.id, unique(appts.map((a) => a.groomerId))))) as (typeof staffUser.$inferSelect)[])
    : [];
  const stays = (await repo
    .select(stay, eq(stay.bookingId, bk.id))
    .orderBy(asc(stay.checkInDate), asc(stay.id))) as (typeof stay.$inferSelect)[];
  const types = stays.length
    ? ((await repo.select(roomType, inArray(roomType.id, unique(stays.map((s) => s.roomTypeId))))) as (typeof roomType.$inferSelect)[])
    : [];
  const visits = (await repo
    .select(daycareVisit, eq(daycareVisit.bookingId, bk.id))
    .orderBy(asc(daycareVisit.visitDate), asc(daycareVisit.id))) as (typeof daycareVisit.$inferSelect)[];
  const sessions = visits.length
    ? ((await repo.select(
        daycareSessionType,
        inArray(daycareSessionType.id, unique(visits.map((v) => v.sessionTypeId))),
      )) as (typeof daycareSessionType.$inferSelect)[])
    : [];
  // pet has no organization_id: ids come from the org-checked child rows
  const petIds = unique([...appts.map((a) => a.petId), ...stays.map((s) => s.petId), ...visits.map((v) => v.petId)]);
  const pets = petIds.length ? await db.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : [];
  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? "";

  const groom = appts.map((a) => ({
    startsAt: a.startsAt.toISOString(),
    petName: petName(a.petId),
    groomerName: groomers.find((g) => g.id === a.groomerId)?.displayName ?? "",
    services: items.filter((i) => i.appointmentId === a.id).map((i) => i.nameSnapshot),
  }));
  const stayLines = stays.map((s) => ({
    checkInDate: s.checkInDate,
    checkOutDate: s.checkOutDate,
    roomTypeName: types.find((t) => t.id === s.roomTypeId)?.nameTh ?? "",
  }));
  const daycare = visits.map((v) => ({
    visitDate: v.visitDate,
    sessionName: sessions.find((t) => t.id === v.sessionTypeId)?.nameTh ?? "",
  }));
  return { groom, stays: stayLines, daycare, petNames: petIds.map(petName) };
}

/** R-21 for a booking, with the reschedule cutoff as booked (branch_policy default 24 h when an old snapshot lacks it). */
export function selfService(ctx: RequestContext, bk: BookingRow) {
  const snap = bk.policySnapshot as Record<string, unknown>;
  return customerSelfService({
    now: ctx.now.toISOString(),
    // no service yet → nothing left to cancel or move
    firstServiceAt: (bk.firstServiceAt ?? ctx.now).toISOString(),
    status: bk.status,
    rescheduleCutoffHours: Number(snap.rescheduleCutoffHours ?? 24),
    rescheduleCount: bk.rescheduleCount,
  });
}

/** 05#dto-MyBookingItem */
export function myBookingItem(ctx: RequestContext, bk: BookingRow, lines: Awaited<ReturnType<typeof bookingLines>>): MyBookingItem {
  const { canCancel, canReschedule } = selfService(ctx, bk);
  return {
    id: bk.id,
    bookingNo: bk.bookingNo,
    status: bk.status,
    firstServiceAt: bk.firstServiceAt?.toISOString() ?? null,
    petNames: lines.petNames,
    summary: unique([
      ...lines.groom.flatMap((g) => g.services),
      ...lines.stays.map((s) => s.roomTypeName),
      ...lines.daycare.map((v) => v.sessionName),
    ]).join(", "),
    depositStatus: bk.depositStatus,
    estimatedTotalSatang: bk.estimatedTotalSatang,
    canCancel,
    canReschedule,
  };
}

/** The signed-in customer's booking in this branch, or NOT_FOUND. */
export async function requireMyBooking(ctx: RequestContext, db: Executor, bookingId: string): Promise<BookingRow> {
  if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const [bk] = (await tenantDb(ctx, db).select(
    booking,
    and(eq(booking.id, bookingId), eq(booking.customerId, ctx.actor.id)),
  )) as BookingRow[];
  if (!bk || bk.branchId !== ctx.branchId) throw new AppError("NOT_FOUND");
  return bk;
}

/** 05#ep-liff.bookings: the customer's bookings in this branch; upcoming soonest first, past latest first (Q-1036). */
export async function liffBookings(ctx: RequestContext, input: LiffBookingsRequest): Promise<LiffBookingsResponse> {
  if (ctx.actor.type !== "customer" || !ctx.actor.id || !ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const past = input.scope === "past";
  const rows = (await tenantDb(ctx, db).select(
    booking,
    and(eq(booking.customerId, ctx.actor.id), eq(booking.branchId, ctx.branchId), inArray(booking.status, past ? [...DONE] : [...OPEN])),
  )) as BookingRow[];
  const at = (b: BookingRow) => (b.firstServiceAt ?? b.createdAt).getTime();
  rows.sort((a, b) => (past ? at(b) - at(a) : at(a) - at(b)) || a.bookingNo.localeCompare(b.bookingNo));
  const out: MyBookingItem[] = [];
  for (const b of rows) out.push(myBookingItem(ctx, b, await bookingLines(ctx, db, b)));
  return out;
}
