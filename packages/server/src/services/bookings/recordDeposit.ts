import type { BookingsRecordDepositRequest, BookingsRecordDepositResponse } from "@app/contracts/endpoints/bookings.recordDeposit";
import { booking, branch, groomAppointment, groomAppointmentItem, payment, pet } from "@app/db/schema";
import { formatTHB, formatThaiDate, formatTime } from "@app/domain/format/thai";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { cancelJobs, scheduleJob } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "./get.ts";

type BookingRow = typeof booking.$inferSelect;
const DAY_MS = 86_400_000;

/**
 * Leaving awaiting_deposit (03): a booking that needed approval at creation (approval_due_at set, R-08) goes to
 * awaiting_approval and keeps its approval_overdue job; otherwise confirmed → reminder_24h per active appointment and
 * customer.booking_confirmed (wording as bookings.create, Q-0091). The hold ends either way.
 */
export async function leaveAwaitingDeposit(tx: Tx, ctx: RequestContext, bk: BookingRow, reason: string | null) {
  await cancelJobs(tx, `expire_hold:${bk.id}:`, ctx);
  if (bk.approvalDueAt) {
    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "booking",
      to: "awaiting_approval",
      reason,
      extraSet: { holdExpiresAt: null },
    });
    return;
  }
  await transition(tx, ctx, {
    table: booking,
    id: bk.id,
    machine: "booking",
    to: "confirmed",
    reason,
    extraSet: { holdExpiresAt: null, confirmedAt: ctx.now },
  });
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const appts = (await db
    .select(groomAppointment, and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, ["cancelled", "no_show"])))
    .orderBy(asc(groomAppointment.startsAt))) as (typeof groomAppointment.$inferSelect)[];
  for (const a of appts) {
    const runAt = new Date(a.startsAt.getTime() - DAY_MS);
    if (runAt > ctx.now)
      await scheduleJob(tx, {
        type: "reminder_24h",
        runAt,
        payload: { bookingId: bk.id, entityType: "groom_appointment", entityId: a.id },
        dedupeKey: `reminder_24h:${a.id}:${a.startsAt.toISOString()}`,
        orgId: bk.organizationId,
      });
  }
  const items = appts.length
    ? ((await db.select(
        groomAppointmentItem,
        inArray(
          groomAppointmentItem.appointmentId,
          appts.map((a) => a.id),
        ),
      )) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  // pet has no organization_id: reached through the org-checked appointments
  const pets = appts.length
    ? await tx
        .select({ id: pet.id, name: pet.name })
        .from(pet)
        .where(
          inArray(
            pet.id,
            appts.map((a) => a.petId),
          ),
        )
    : [];
  const first = appts[0]?.startsAt ?? bk.firstServiceAt;
  const tz = br.timezone;
  await enqueueNotification(
    tx,
    { ...ctx, branchId: br.id, timezone: tz },
    {
      key: "customer.booking_confirmed",
      recipient: { type: "customer", id: bk.customerId },
      payload: {
        bookingNo: bk.bookingNo,
        summary: appts
          .map(
            (a) =>
              `${pets.find((p) => p.id === a.petId)?.name ?? ""}: ${items
                .filter((i) => i.appointmentId === a.id)
                .map((i) => i.nameSnapshot)
                .join(", ")}`,
          )
          .join(" / "),
        dateTime: first
          ? `${formatThaiDate({ date: toLocalDate({ instant: first.toISOString(), timezone: tz }) })} ${formatTime({ instant: first.toISOString(), timezone: tz })}`
          : "",
        shopName: br.name,
        bookingUrl: new URL(`/liff/${br.bookingSlug}/bookings/${bk.id}`, process.env.APP_BASE_URL).toString(),
      },
      dedupeKey: `booking_confirmed:${bk.id}`,
    },
  );
}

/**
 * 05#ep-bookings.recordDeposit: the shop takes the deposit itself — payment (booking_id), deposit_verified += amount,
 * deposit pending|rejected → verified, audit payment.create, customer.deposit_confirmed; an awaiting_deposit booking
 * moves on (leaveAwaitingDeposit). Other booking states keep their status.
 */
export async function bookingsRecordDeposit(
  ctx: RequestContext,
  input: BookingsRecordDepositRequest & { bookingId: string },
): Promise<BookingsRecordDepositResponse> {
  requireRole(ctx, "bookings.recordDeposit");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [bk] = (await db.select(booking, eq(booking.id, input.bookingId)).for("update")) as BookingRow[];
    if (!bk) throw new AppError("NOT_FOUND");
    if (!["pending", "rejected"].includes(bk.depositStatus) || !["awaiting_deposit", "confirmed", "awaiting_approval"].includes(bk.status))
      throw new AppError("INVALID_TRANSITION");
    if (input.proofFileId) await commitFile(tx, ctx, input.proofFileId, "proof");
    const [p] = (await db.insert(payment, {
      branchId: bk.branchId,
      bookingId: bk.id,
      method: input.method,
      amountSatang: input.amountSatang,
      reference: input.reference ?? null,
      proofFileId: input.proofFileId ?? null,
      receivedBy: ctx.actor.id,
      receivedAt: ctx.now,
    })) as (typeof payment.$inferSelect)[];
    if (!p) throw new AppError("INTERNAL");
    await transition(tx, ctx, {
      table: booking,
      id: bk.id,
      machine: "deposit",
      to: "verified",
      extraSet: { depositVerifiedSatang: bk.depositVerifiedSatang + input.amountSatang },
    });
    await writeAudit(tx, ctx, {
      action: "payment.create",
      entityType: "payment",
      entityId: p.id,
      after: { method: p.method, amountSatang: p.amountSatang, bookingId: bk.id },
    });
    if (bk.status === "awaiting_deposit") await leaveAwaitingDeposit(tx, ctx, bk, null);
    const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
    await enqueueNotification(
      tx,
      { ...ctx, branchId: bk.branchId, timezone: br?.timezone ?? ctx.timezone },
      {
        key: "customer.deposit_confirmed",
        recipient: { type: "customer", id: bk.customerId },
        payload: { bookingNo: bk.bookingNo, amount: formatTHB({ satang: input.amountSatang }) },
        dedupeKey: `deposit_confirmed:${bk.id}`,
      },
    );
  });
  return bookingDetail(ctx, getDb(), input.bookingId);
}
