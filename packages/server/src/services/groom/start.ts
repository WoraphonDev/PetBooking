import type { GroomStartRequest, GroomStartResponse } from "@app/contracts/endpoints/groom.start";
import { groomAppointment } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;

/** 05#ep-groom.start: checked_in → in_progress, started_at = now; role staff only for their own appointment. */
export async function groomStart(ctx: RequestContext, input: GroomStartRequest): Promise<GroomStartResponse> {
  requireRole(ctx, "groom.start");
  const row = await withTx(ctx, async (tx) => {
    const [a] = (await tenantDb(ctx, tx).select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    if (ctx.actor.role === "staff" && a.groomerId !== ctx.actor.id) throw new AppError("FORBIDDEN");
    return (await transition(tx, ctx, {
      table: groomAppointment,
      id: a.id,
      machine: "groom_appointment",
      to: "in_progress",
      extraSet: { startedAt: ctx.now },
    })) as Appt;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
