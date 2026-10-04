import type { GroomRescheduleRequest, GroomRescheduleResponse } from "@app/contracts/endpoints/groom.reschedule";
import { booking, branch, branchPolicy, groomAppointment, groomAppointmentItem, pet } from "@app/db/schema";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs, scheduleJob } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { availabilityGroomSlots } from "../availability/groomSlots.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;
const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const ENDED = ["cancelled", "no_show"] as const;

/**
 * 05#ep-groom.reschedule: a scheduled appointment (else STATUS_NOT_ALLOWED) moves to an R-04 slot computed without
 * itself (else SLOT_TAKEN; a racing insert hits the exclusion constraints → SLOT_TAKEN too). ends/blocked_until from
 * the item snapshots (R-03) + buffer, booking.first_service_at recomputed, booking_event scheduled → scheduled with
 * reason "reschedule", reminder_24h replaced, customer.booking_rescheduled unless notifyCustomer = false.
 */
export async function groomReschedule(
  ctx: RequestContext,
  input: GroomRescheduleRequest & { appointmentId: string },
): Promise<GroomRescheduleResponse> {
  requireRole(ctx, "groom.reschedule");
  const db = tenantDb(ctx, getDb());
  const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
  if (!a) throw new AppError("NOT_FOUND");
  if (a.status !== "scheduled") throw new AppError("STATUS_NOT_ALLOWED", { status: a.status });
  const [br] = (await db.select(branch, eq(branch.id, a.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const items = (await db.select(
    groomAppointmentItem,
    eq(groomAppointmentItem.appointmentId, a.id),
  )) as (typeof groomAppointmentItem.$inferSelect)[];

  // R-04 on the new local day, this appointment excluded; the requested groomer/station/time must be one of the slots
  const slots = await availabilityGroomSlots(ctx, {
    date: toLocalDate({ instant: input.startsAt, timezone: br.timezone }),
    petId: a.petId,
    serviceIds: items.filter((i) => !i.isAddon).map((i) => i.serviceId),
    addonIds: items.filter((i) => i.isAddon).map((i) => i.serviceId),
    groomerId: input.groomerId,
    sizeTierId: a.sizeTierId ?? undefined,
    excludeAppointmentId: a.id,
    pendingAppointments: [],
  });
  const startsAt = new Date(input.startsAt);
  if (
    !slots.slots.some(
      (s) => Date.parse(s.startsAt) === startsAt.getTime() && s.groomerId === input.groomerId && s.stationId === input.stationId,
    )
  )
    throw new AppError("SLOT_TAKEN");

  const row = await withTx(ctx, async (tx) => {
    const t = tenantDb(ctx, tx);
    // branch_policy is keyed by the org-checked branch; a missing row means the column default
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
    const duration = items.reduce((s, i) => s + i.durationMinutes, 0);
    const endsAt = new Date(startsAt.getTime() + duration * MINUTE);
    const updated = (await transition(tx, ctx, {
      table: groomAppointment,
      id: a.id,
      machine: "groom_appointment",
      to: "scheduled",
      reason: input.reason ? `reschedule: ${input.reason}` : "reschedule",
      extraSet: {
        startsAt,
        endsAt,
        blockedUntil: new Date(endsAt.getTime() + (policy?.bufferMinutes ?? 10) * MINUTE),
        groomerId: input.groomerId,
        stationId: input.stationId,
      },
    })) as Appt;

    // first service = the earliest active appointment of the booking
    const [bk] = (await t.select(booking, eq(booking.id, a.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const active = (await t.select(
      groomAppointment,
      and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, [...ENDED])),
    )) as Appt[];
    const first = active.map((x) => (x.id === a.id ? startsAt : x.startsAt)).sort((x, y) => x.getTime() - y.getTime())[0];
    if (first) await t.update(booking, { firstServiceAt: first, updatedAt: ctx.now }, eq(booking.id, bk.id));

    // 07 §2 reminder_24h: replace the old one; none when the new start is less than 24 h away
    await cancelJobs(tx, `reminder_24h:${a.id}:`, ctx);
    const runAt = new Date(startsAt.getTime() - DAY_MS);
    if (runAt > ctx.now)
      await scheduleJob(tx, {
        type: "reminder_24h",
        runAt,
        payload: { bookingId: bk.id, entityType: "groom_appointment", entityId: a.id },
        dedupeKey: `reminder_24h:${a.id}:${startsAt.toISOString()}`,
        orgId: bk.organizationId,
      });

    if (input.notifyCustomer) {
      const when = (d: Date) =>
        `${formatThaiDate({ date: toLocalDate({ instant: d.toISOString(), timezone: br.timezone }) })} ${formatTime({ instant: d.toISOString(), timezone: br.timezone })}`;
      // pet has no organization_id: reached through the org-checked appointment
      const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, a.petId));
      await enqueueNotification(
        tx,
        { ...ctx, branchId: br.id, timezone: br.timezone },
        {
          key: "customer.booking_rescheduled",
          recipient: { type: "customer", id: bk.customerId },
          payload: { petName: p?.name ?? "", oldDateTime: when(a.startsAt), newDateTime: when(startsAt) },
          dedupeKey: `booking_rescheduled:${a.id}:${startsAt.toISOString()}`,
        },
      );
    }
    return updated;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
