import type { GroomAddSurchargeRequest, GroomAddSurchargeResponse } from "@app/contracts/endpoints/groom.addSurcharge";
import { appointmentSurcharge, bill, billLine, booking, groomAppointment, surchargeType } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { recomputeBill } from "../bills/removeLine.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;
/** surcharges belong to an appointment that is still being served or billed */
const ENDED = ["cancelled", "no_show"];

/**
 * The appointment a surcharge may change (cancelled / no-show → STATUS_NOT_ALLOWED) and the booking's bill: an open bill
 * follows the change, a paid or void bill cannot (BILL_NOT_OPEN).
 */
export async function surchargeTarget(tx: Tx, ctx: RequestContext, appointmentId: string) {
  const db = tenantDb(ctx, tx);
  const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, appointmentId)).for("update")) as Appt[];
  if (!a) throw new AppError("NOT_FOUND");
  if (ENDED.includes(a.status)) throw new AppError("STATUS_NOT_ALLOWED", { status: a.status });
  const [bk] = (await db.select(booking, eq(booking.id, a.bookingId))) as (typeof booking.$inferSelect)[];
  const [b] = bk?.billId ? ((await db.select(bill, eq(bill.id, bk.billId)).for("update")) as (typeof bill.$inferSelect)[]) : [];
  if (b && b.status !== "open") throw new AppError("BILL_NOT_OPEN");
  return { a, bill: b };
}

/** open bill totals after a surcharge line changed (R-15) */
export async function refreshBill(tx: Tx, ctx: RequestContext, b: typeof bill.$inferSelect) {
  const { totals } = await recomputeBill(ctx, tx, b);
  await tenantDb(ctx, tx).update(
    bill,
    { subtotalSatang: totals.subtotalSatang, totalSatang: totals.totalSatang, updatedAt: ctx.now },
    eq(bill.id, b.id),
  );
}

/** 05#ep-groom.addSurcharge: appointment_surcharge + surcharge_total_satang; an open bill gets a `surcharge` line. */
export async function groomAddSurcharge(
  ctx: RequestContext,
  input: GroomAddSurchargeRequest & { appointmentId: string },
): Promise<GroomAddSurchargeResponse> {
  requireRole(ctx, "groom.addSurcharge");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const { a, bill: b } = await surchargeTarget(tx, ctx, input.appointmentId);
    if (input.surchargeTypeId) {
      const [type] = await db.select(
        surchargeType,
        and(eq(surchargeType.id, input.surchargeTypeId), eq(surchargeType.branchId, a.branchId)),
      );
      if (!type) throw new AppError("NOT_FOUND");
    }
    const [s] = (await db.insert(appointmentSurcharge, {
      appointmentId: a.id,
      surchargeTypeId: input.surchargeTypeId ?? null,
      name: input.name,
      amountSatang: input.amountSatang,
      reason: input.reason,
      createdBy: ctx.actor.id as string,
      createdAt: ctx.now,
    })) as (typeof appointmentSurcharge.$inferSelect)[];
    if (!s) throw new AppError("INTERNAL");
    const [updated] = (await db.update(
      groomAppointment,
      { surchargeTotalSatang: a.surchargeTotalSatang + input.amountSatang, updatedAt: ctx.now },
      eq(groomAppointment.id, a.id),
    )) as Appt[];
    if (b) {
      // same line shape as bills.open builds for surcharges
      await db.insert(billLine, {
        billId: b.id,
        lineType: "surcharge",
        refType: "appointment_surcharge",
        refId: s.id,
        description: s.name,
        petId: a.petId,
        performerId: a.groomerId,
        unitPriceSatang: s.amountSatang,
        lineTotalSatang: s.amountSatang,
      });
      await refreshBill(tx, ctx, b);
    }
    return updated ?? a;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
