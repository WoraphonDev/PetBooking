import type { BillsSetDiscountRequest, BillsSetDiscountResponse } from "@app/contracts/endpoints/bills.setDiscount";
import { bill } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";
import { recomputeBill } from "./removeLine.ts";

type BillRow = typeof bill.$inferSelect;
/** R-15 #2 (Q-0055): front_desk may discount at most 20% of the gross Σ qty × unit, line + bill discounts together */
const FRONT_DESK_DISCOUNT_BPS = 2_000;

/** Sets the whole-bill discount of an open bill (05#ep-bills.setDiscount, R-15). */
export async function billsSetDiscount(
  ctx: RequestContext,
  input: BillsSetDiscountRequest & { billId: string },
): Promise<BillsSetDiscountResponse> {
  requireRole(ctx, "bills.setDiscount");
  const updated = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    const discount = input.billDiscountSatang;
    const reason = discount > 0 ? (input.reason ?? "").trim() : "";
    if (discount > 0 && reason.length < 3) throw new AppError("REASON_REQUIRED");

    const { lines, totals } = await recomputeBill(ctx, tx, b, discount);
    if (ctx.actor.role === "front_desk") {
      const gross = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceSatang, 0);
      const discounts = lines.reduce((sum, l) => sum + l.lineDiscountSatang, 0) + discount;
      if (discounts * 10_000 > gross * FRONT_DESK_DISCOUNT_BPS) throw new AppError("DISCOUNT_LIMIT_EXCEEDED");
    }
    const [row] = (await db.update(
      bill,
      {
        billDiscountSatang: discount,
        billDiscountReason: reason || null,
        subtotalSatang: totals.subtotalSatang,
        totalSatang: totals.totalSatang,
        updatedAt: ctx.now,
      },
      eq(bill.id, b.id),
    )) as BillRow[];
    if (discount !== b.billDiscountSatang || (reason || null) !== b.billDiscountReason)
      await writeAudit(tx, ctx, {
        action: "bill.discount",
        entityType: "bill",
        entityId: b.id,
        before: { billDiscountSatang: b.billDiscountSatang, billDiscountReason: b.billDiscountReason },
        after: { billDiscountSatang: discount, billDiscountReason: reason || null },
        reason: reason || null,
      });
    return row ?? b;
  });
  return billDetail(ctx, getDb(), updated);
}
