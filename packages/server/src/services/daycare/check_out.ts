import type { DaycareCheckOutRequest, DaycareCheckOutResponse } from "@app/contracts/endpoints/daycare.check_out";
import { bill, billLine, booking, daycareSessionType, daycareVisit } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { refreshBill } from "../groom/addSurcharge.ts";
import { daycareVisitItem } from "./list.ts";

/**
 * 05#ep-daycare.check_out: checked_in → checked_out (checked_out_at) and the visit goes on the bill (03, Q-0106): the
 * booking's open bill without a line for it gets a `daycare` line (as bills.open builds it) and new totals; a paid / void
 * bill without it → STATUS_NOT_ALLOWED; no bill yet → bills.open adds it later.
 */
export async function daycareCheckOut(ctx: RequestContext, input: DaycareCheckOutRequest): Promise<DaycareCheckOutResponse> {
  requireRole(ctx, "daycare.check_out");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [v] = (await db.select(daycareVisit, eq(daycareVisit.id, input.visitId)).for("update")) as (typeof daycareVisit.$inferSelect)[];
    if (!v) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, v.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    await transition(tx, ctx, {
      table: daycareVisit,
      id: v.id,
      machine: "daycare_visit",
      to: "checked_out",
      extraSet: { checkedOutAt: ctx.now },
    });

    const [b] = bk.billId ? ((await db.select(bill, eq(bill.id, bk.billId)).for("update")) as (typeof bill.$inferSelect)[]) : [];
    if (!b) return bk.id;
    const [line] = await db.select(
      billLine,
      and(eq(billLine.billId, b.id), eq(billLine.refType, "daycare_visit"), eq(billLine.refId, v.id)),
    );
    if (line) return bk.id;
    if (b.status !== "open") throw new AppError("STATUS_NOT_ALLOWED", { billStatus: b.status });
    const [session] = (await db.select(
      daycareSessionType,
      eq(daycareSessionType.id, v.sessionTypeId),
    )) as (typeof daycareSessionType.$inferSelect)[];
    await db.insert(billLine, {
      billId: b.id,
      refType: "daycare_visit",
      refId: v.id,
      petId: v.petId,
      lineType: "daycare",
      description: session?.nameTh ?? "",
      quantity: 1,
      unitPriceSatang: v.priceSatang,
      lineTotalSatang: v.priceSatang,
    });
    await refreshBill(tx, ctx, b);
    return bk.id;
  });
  return daycareVisitItem(ctx, getDb(), input.visitId, bookingId);
}
