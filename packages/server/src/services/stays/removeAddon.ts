import type { StaysRemoveAddonRequest, StaysRemoveAddonResponse } from "@app/contracts/endpoints/stays.removeAddon";
import { billLine, booking, stay, stayAddon } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { refreshBill } from "../groom/addSurcharge.ts";
import { stayBill } from "./addAddon.ts";
import { stayDetail } from "./get.ts";

/**
 * 05#ep-stays.removeAddon "ก่อนปิดบิล": a paid / void bill of the booking → BILL_NOT_OPEN; otherwise the add-on goes, its
 * open-bill line goes with new totals, and the booking estimate drops by its total.
 */
export async function staysRemoveAddon(ctx: RequestContext, input: StaysRemoveAddonRequest): Promise<StaysRemoveAddonResponse> {
  requireRole(ctx, "stays.removeAddon");
  const stayId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(stayAddon, eq(stayAddon.id, input.stayAddonId))) as (typeof stayAddon.$inferSelect)[];
    if (!a) throw new AppError("NOT_FOUND");
    const [s] = (await db.select(stay, eq(stay.id, a.stayId))) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const { bk, bill: b } = await stayBill(tx, ctx, s.bookingId);
    // tenantDb has no delete: filter by the tenant key explicitly
    if (b)
      await tx
        .delete(billLine)
        .where(
          and(
            eq(billLine.organizationId, ctx.orgId ?? ""),
            eq(billLine.billId, b.id),
            eq(billLine.refType, "stay_addon"),
            eq(billLine.refId, a.id),
          ),
        );
    await tx.delete(stayAddon).where(and(eq(stayAddon.organizationId, ctx.orgId ?? ""), eq(stayAddon.id, a.id)));
    await db.update(
      booking,
      { estimatedTotalSatang: Math.max(0, bk.estimatedTotalSatang - a.totalSatang), updatedAt: ctx.now },
      eq(booking.id, bk.id),
    );
    if (b) await refreshBill(tx, ctx, b);
    return s.id;
  });
  return stayDetail(ctx, getDb(), stayId);
}
