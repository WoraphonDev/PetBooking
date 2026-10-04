import type { GroomFinishRequest, GroomFinishResponse } from "@app/contracts/endpoints/groom.finish";
import { booking, groomAppointment, pet, reportCard, staffUser } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;

/** 05#ep-groom.finish: in_progress → done, done_at = now, report_card draft (once), staff.groom_done to every front_desk. */
export async function groomFinish(
  ctx: RequestContext,
  input: GroomFinishRequest & { appointmentId: string },
): Promise<GroomFinishResponse> {
  requireRole(ctx, "groom.finish");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    const updated = (await transition(tx, ctx, {
      table: groomAppointment,
      id: a.id,
      machine: "groom_appointment",
      to: "done",
      extraSet: { doneAt: ctx.now, ...(input.staffNote !== undefined ? { staffNote: input.staffNote } : {}) },
    })) as Appt;
    const [bk] = (await db.select(booking, eq(booking.id, a.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const [existing] = await db.select(reportCard, and(eq(reportCard.appointmentId, a.id), eq(reportCard.kind, "grooming")));
    if (!existing)
      await db.insert(reportCard, {
        branchId: a.branchId,
        kind: "grooming",
        appointmentId: a.id,
        petId: a.petId,
        customerId: bk.customerId,
        status: "draft",
        createdBy: ctx.actor.id as string,
        createdAt: ctx.now,
      });

    // pet has no organization_id: reached through the org-checked appointment
    const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, a.petId));
    const [groomer] = (await db.select(staffUser, eq(staffUser.id, a.groomerId))) as (typeof staffUser.$inferSelect)[];
    const frontDesk = (await db.select(
      staffUser,
      and(eq(staffUser.role, "front_desk"), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of frontDesk)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: a.branchId },
        {
          key: "staff.groom_done",
          recipient: { type: "staff", id: member.id },
          payload: { petName: p?.name ?? "", groomerName: groomer?.displayName ?? "" },
          dedupeKey: `groom_done:${a.id}`,
        },
      );
    return updated;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
