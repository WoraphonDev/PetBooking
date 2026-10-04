import type { GroomNotifyPickupRequest, GroomNotifyPickupResponse } from "@app/contracts/endpoints/groom.notifyPickup";
import { bill, booking, branch, groomAppointment, pet, reportCard } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;

/**
 * 05#ep-groom.notifyPickup: customer.ready_for_pickup for a done appointment (else STATUS_NOT_ALLOWED, Q-0098); a sent
 * report card rides in the same message (07 §1.2 reportCardLine). balance = open bill due, else estimate − verified deposit (Q-0098).
 */
export async function groomNotifyPickup(ctx: RequestContext, input: GroomNotifyPickupRequest): Promise<GroomNotifyPickupResponse> {
  requireRole(ctx, "groom.notifyPickup");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    if (a.status !== "done") throw new AppError("STATUS_NOT_ALLOWED", { status: a.status });
    const [bk] = (await db.select(booking, eq(booking.id, a.bookingId))) as (typeof booking.$inferSelect)[];
    const [br] = (await db.select(branch, eq(branch.id, a.branchId))) as (typeof branch.$inferSelect)[];
    if (!bk || !br) throw new AppError("NOT_FOUND");

    const [open] = bk.billId
      ? ((await db.select(bill, and(eq(bill.id, bk.billId), eq(bill.status, "open")))) as (typeof bill.$inferSelect)[])
      : [];
    const balance = open ? open.totalSatang - open.paidSatang : bk.estimatedTotalSatang - bk.depositVerifiedSatang;
    const [card] = (await db.select(
      reportCard,
      and(eq(reportCard.appointmentId, a.id), eq(reportCard.kind, "grooming"), eq(reportCard.status, "sent")),
    )) as (typeof reportCard.$inferSelect)[];
    // pet has no organization_id: reached through the org-checked appointment
    const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, a.petId));
    await enqueueNotification(
      tx,
      { ...ctx, branchId: br.id, timezone: br.timezone },
      {
        key: "customer.ready_for_pickup",
        recipient: { type: "customer", id: bk.customerId },
        payload: {
          petName: p?.name ?? "",
          // L-11; empty → the template drops the report card line
          reportCardUrl: card ? new URL(`/liff/${br.bookingSlug}/report-cards/${card.id}`, process.env.APP_BASE_URL).toString() : "",
          balance: formatTHB({ satang: Math.max(0, balance) }),
        },
        dedupeKey: `ready_for_pickup:${a.id}`,
      },
    );
    return a;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
