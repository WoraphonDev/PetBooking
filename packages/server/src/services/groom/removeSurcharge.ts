import type { GroomRemoveSurchargeRequest, GroomRemoveSurchargeResponse } from "@app/contracts/endpoints/groom.removeSurcharge";
import { appointmentSurcharge, billLine, groomAppointment } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { appointmentCards } from "../bookings/get.ts";
import { refreshBill, surchargeTarget } from "./addSurcharge.ts";

type Appt = typeof groomAppointment.$inferSelect;

/** 05#ep-groom.removeSurcharge: deletes the surcharge, lowers surcharge_total_satang and drops its line from an open bill. */
export async function groomRemoveSurcharge(ctx: RequestContext, input: GroomRemoveSurchargeRequest): Promise<GroomRemoveSurchargeResponse> {
  requireRole(ctx, "groom.removeSurcharge");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(
      appointmentSurcharge,
      eq(appointmentSurcharge.id, input.surchargeId),
    )) as (typeof appointmentSurcharge.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const { a, bill: b } = await surchargeTarget(tx, ctx, s.appointmentId);
    await tx
      .delete(appointmentSurcharge)
      .where(and(eq(appointmentSurcharge.organizationId, s.organizationId), eq(appointmentSurcharge.id, s.id)));
    const [updated] = (await db.update(
      groomAppointment,
      { surchargeTotalSatang: Math.max(0, a.surchargeTotalSatang - s.amountSatang), updatedAt: ctx.now },
      eq(groomAppointment.id, a.id),
    )) as Appt[];
    if (b) {
      await tx
        .delete(billLine)
        .where(
          and(
            eq(billLine.organizationId, b.organizationId),
            eq(billLine.billId, b.id),
            eq(billLine.refType, "appointment_surcharge"),
            eq(billLine.refId, s.id),
          ),
        );
      await refreshBill(tx, ctx, b);
    }
    return updated ?? a;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
