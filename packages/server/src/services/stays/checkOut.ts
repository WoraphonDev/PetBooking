import type { StaysCheckOutRequest, StaysCheckOutResponse } from "@app/contracts/endpoints/stays.checkOut";
import { booking, careTask, reportCard, roomUnit, stay, stayBelonging } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { billsOpen } from "../bills/open.ts";
import { stayDetail } from "./get.ts";

/**
 * 05#ep-stays.checkOut: checked_in → checked_out (checked_out_at, weight_grams_out). Every belonging must be returned
 * (returned_at = now) unless missingNote is given (03 guard; else VALIDATION_FAILED). The room turns dirty, pending care
 * tasks are skipped, a stay report card draft is created (once). Then the booking's bill is opened (bills.open, which builds
 * the stay lines) when it has none yet — Q-0113: missingNote has no column and the bill opens after the check-out commits.
 */
export async function staysCheckOut(ctx: RequestContext, input: StaysCheckOutRequest & { stayId: string }): Promise<StaysCheckOutResponse> {
  requireRole(ctx, "stays.checkOut");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId)).for("update")) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, s.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");

    const belongings = (await db.select(stayBelonging, eq(stayBelonging.stayId, s.id))) as (typeof stayBelonging.$inferSelect)[];
    const returned = new Set(input.returnedBelongingIds);
    if ([...returned].some((id) => !belongings.some((b) => b.id === id)))
      throw new AppError("VALIDATION_FAILED", { fields: { returnedBelongingIds: "not a belonging of this stay" } });
    const missing = belongings.filter((b) => !b.returnedAt && !returned.has(b.id));
    if (missing.length && !input.missingNote)
      throw new AppError("VALIDATION_FAILED", {
        fields: { missingNote: "required when belongings are missing" },
        missing: missing.map((b) => b.id),
      });

    await transition(tx, ctx, {
      table: stay,
      id: s.id,
      machine: "stay",
      to: "checked_out",
      extraSet: { checkedOutAt: ctx.now, weightGramsOut: input.weightGramsOut ?? null, updatedAt: ctx.now },
    });
    const toReturn = belongings.filter((b) => !b.returnedAt && returned.has(b.id)).map((b) => b.id);
    if (toReturn.length) await db.update(stayBelonging, { returnedAt: ctx.now, updatedAt: ctx.now }, inArray(stayBelonging.id, toReturn));
    if (s.roomUnitId) await db.update(roomUnit, { housekeeping: "dirty", updatedAt: ctx.now }, eq(roomUnit.id, s.roomUnitId));
    const pending = (await db.select(
      careTask,
      and(eq(careTask.stayId, s.id), eq(careTask.status, "pending")),
    )) as (typeof careTask.$inferSelect)[];
    for (const t of pending)
      await transition(tx, ctx, { table: careTask, id: t.id, machine: "care_task", to: "skipped", extraSet: { updatedAt: ctx.now } });
    const [card] = await db.select(reportCard, eq(reportCard.stayId, s.id));
    if (!card)
      await db.insert(reportCard, {
        branchId: s.branchId,
        kind: "stay",
        stayId: s.id,
        petId: s.petId,
        customerId: bk.customerId,
        status: "draft",
        createdBy: ctx.actor.id as string,
        createdAt: ctx.now,
      });
    return bk.id;
  });

  // bills.open is idempotent per booking and builds the stay lines; only a confirmed booking without a bill gets one
  const [bk] = (await tenantDb(ctx, getDb()).select(booking, eq(booking.id, bookingId))) as (typeof booking.$inferSelect)[];
  if (bk && !bk.billId && bk.status === "confirmed") await billsOpen(ctx, { bookingIds: [bk.id] });
  return stayDetail(ctx, getDb(), input.stayId);
}
