import type { BookingsApproveRequest, BookingsApproveResponse } from "@app/contracts/endpoints/bookings.approve";
import { booking, branch, daycareSessionType, daycareVisit, groomAppointment, groomAppointmentItem, pet, stay } from "@app/db/schema";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs, scheduleJob } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "./get.ts";

const DAY_MS = 86_400_000;
const ENDED = ["cancelled", "no_show"] as const;

/**
 * 05#ep-bookings.approve: awaiting_approval → confirmed (confirmed_at), approval_overdue jobs cancelled, reminder_24h per
 * active child (03 side effect) and customer.booking_confirmed — wording as bookings.create (Q-0091).
 */
export async function bookingsApprove(ctx: RequestContext, input: BookingsApproveRequest): Promise<BookingsApproveResponse> {
  requireRole(ctx, "bookings.approve");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [bk] = (await db.select(booking, eq(booking.id, input.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    if (bk.status !== "awaiting_approval") throw new AppError("INVALID_TRANSITION");
    await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "confirmed", extraSet: { confirmedAt: ctx.now } });
    await cancelJobs(tx, `approval_overdue:${bk.id}:`, ctx);
    const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");
    await confirmEffects(tx, ctx, bk, br);
  });
  return bookingDetail(ctx, getDb(), input.bookingId);
}

/** reminder_24h for every active child + customer.booking_confirmed */
async function confirmEffects(tx: Tx, ctx: RequestContext, bk: typeof booking.$inferSelect, br: typeof branch.$inferSelect) {
  const db = tenantDb(ctx, tx);
  const tz = br.timezone;
  const appts = (await db
    .select(groomAppointment, and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, [...ENDED])))
    .orderBy(asc(groomAppointment.startsAt))) as (typeof groomAppointment.$inferSelect)[];
  const stays = (await db.select(
    stay,
    and(eq(stay.bookingId, bk.id), notInArray(stay.status, [...ENDED])),
  )) as (typeof stay.$inferSelect)[];
  const visits = (await db.select(
    daycareVisit,
    and(eq(daycareVisit.bookingId, bk.id), notInArray(daycareVisit.status, [...ENDED])),
  )) as (typeof daycareVisit.$inferSelect)[];
  const sessions = visits.length
    ? ((await db.select(
        daycareSessionType,
        inArray(
          daycareSessionType.id,
          visits.map((v) => v.sessionTypeId),
        ),
      )) as (typeof daycareSessionType.$inferSelect)[])
    : [];

  // 07 §2 reminder_24h: run_at = start − 24 h, not set when the start is less than 24 h away
  const starts = [
    ...appts.map((a) => ({ entityType: "groom_appointment" as const, id: a.id, startsAt: a.startsAt.toISOString() })),
    ...stays.map((s) => ({
      entityType: "stay" as const,
      id: s.id,
      // a stay without an expected time is still matched by its check-in day (reminder_24h handler)
      startsAt: localToUtc({ date: s.checkInDate, time: s.expectedCheckInTime?.slice(0, 5) ?? "00:00", timezone: tz }),
    })),
    ...visits.map((v) => ({
      entityType: "daycare_visit" as const,
      id: v.id,
      startsAt: localToUtc({
        date: v.visitDate,
        time: sessions.find((x) => x.id === v.sessionTypeId)?.startsAt.slice(0, 5) ?? "00:00",
        timezone: tz,
      }),
    })),
  ];
  for (const s of starts) {
    const runAt = new Date(Date.parse(s.startsAt) - DAY_MS);
    if (runAt > ctx.now)
      await scheduleJob(tx, {
        type: "reminder_24h",
        runAt,
        payload: { bookingId: bk.id, entityType: s.entityType, entityId: s.id },
        dedupeKey: `reminder_24h:${s.id}:${s.startsAt}`,
        orgId: bk.organizationId,
      });
  }

  // Q-0091 wording (as bookings.create): "{pet}: {services}" per pet, first start as R-31 date + time
  const items = appts.length
    ? ((await db.select(
        groomAppointmentItem,
        inArray(
          groomAppointmentItem.appointmentId,
          appts.map((a) => a.id),
        ),
      )) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  const petIds = [...new Set([...appts, ...stays, ...visits].map((x) => x.petId))];
  // pet has no organization_id: reached through the org-checked children
  const pets = petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : [];
  const nameOf = (id: string) => pets.find((p) => p.id === id)?.name ?? "";
  const summary = appts
    .map(
      (a) =>
        `${nameOf(a.petId)}: ${items
          .filter((i) => i.appointmentId === a.id)
          .map((i) => i.nameSnapshot)
          .join(", ")}`,
    )
    .join(" / ");
  const first = starts.map((s) => s.startsAt).sort()[0] ?? bk.firstServiceAt?.toISOString() ?? null;
  await enqueueNotification(
    tx,
    { ...ctx, branchId: br.id, timezone: tz },
    {
      key: "customer.booking_confirmed",
      recipient: { type: "customer", id: bk.customerId },
      payload: {
        bookingNo: bk.bookingNo,
        summary,
        dateTime: first
          ? `${formatThaiDate({ date: toLocalDate({ instant: first, timezone: tz }) })} ${formatTime({ instant: first, timezone: tz })}`
          : "",
        shopName: br.name,
        bookingUrl: new URL(`/liff/${br.bookingSlug}/bookings/${bk.id}`, process.env.APP_BASE_URL).toString(),
      },
      dedupeKey: `booking_confirmed:${bk.id}`,
    },
  );
}
