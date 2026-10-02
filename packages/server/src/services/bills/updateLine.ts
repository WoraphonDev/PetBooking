import type { BillsUpdateLineRequest, BillsUpdateLineResponse } from "@app/contracts/endpoints/bills.updateLine";
import { bill, billLine, payment, staffUser } from "@app/db/schema";
import { computeBillTotals } from "@app/domain/billing/totals";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";

type LineRow = typeof billLine.$inferSelect;
type BillRow = typeof bill.$inferSelect;
/** R-15 #2: front_desk may discount at most 20% of the bill (in basis points of the gross Σ qty × unit) */
const FRONT_DESK_DISCOUNT_BPS = 2_000;

/** Edits one line of an open bill (discount, performer, quick_item quantity) and recomputes the totals (R-15). */
export async function billsUpdateLine(
  ctx: RequestContext,
  input: BillsUpdateLineRequest & { lineId: string },
): Promise<BillsUpdateLineResponse> {
  requireRole(ctx, "bills.updateLine");
  const updated = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [current] = (await db.select(billLine, eq(billLine.id, input.lineId))) as LineRow[];
    if (!current) throw new AppError("NOT_FOUND");
    const [b] = (await db.select(bill, eq(bill.id, current.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");

    // Q-0055: quantity is editable on quick_item lines only; the performer must be an active staff of this shop
    if (input.quantity !== undefined && current.lineType !== "quick_item")
      throw new AppError("VALIDATION_FAILED", { fields: { quantity: "only quick_item lines" } });
    if (input.performerId) {
      const [staff] = (await db.select(staffUser, and(eq(staffUser.id, input.performerId), eq(staffUser.status, "active")))) as unknown[];
      if (!staff) throw new AppError("VALIDATION_FAILED", { fields: { performerId: "not an active staff member" } });
    }

    const quantity = input.quantity ?? current.quantity;
    const discount = input.lineDiscountSatang ?? current.lineDiscountSatang;
    const reason = discount > 0 ? (input.lineDiscountReason ?? current.lineDiscountReason ?? "").trim() : "";
    if (discount > 0 && reason.length < 3) throw new AppError("REASON_REQUIRED");
    if (discount > quantity * current.unitPriceSatang) throw new AppError("LINE_DISCOUNT_TOO_LARGE");

    const lines = ((await db.select(billLine, eq(billLine.billId, b.id))) as LineRow[]).map((l) =>
      l.id === current.id ? { ...l, quantity, lineDiscountSatang: discount } : l,
    );
    const posted = (await db.select(
      payment,
      and(eq(payment.billId, b.id), eq(payment.status, "posted")),
    )) as (typeof payment.$inferSelect)[];
    const totals = computeBillTotals({
      lines: lines.map((l) => ({ quantity: l.quantity, unitPriceSatang: l.unitPriceSatang, lineDiscountSatang: l.lineDiscountSatang })),
      billDiscountSatang: b.billDiscountSatang,
      payments: posted.map((p) => ({ method: p.method, amountSatang: p.amountSatang, status: "posted" as const })),
    });
    if ("error" in totals) throw new AppError(totals.error === "INVALID_QUANTITY" ? "VALIDATION_FAILED" : totals.error);

    const discountChanged = discount !== current.lineDiscountSatang || (reason || null) !== current.lineDiscountReason;
    if (ctx.actor.role === "front_desk" && (discountChanged || quantity !== current.quantity)) {
      const gross = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceSatang, 0);
      const discounts = lines.reduce((sum, l) => sum + l.lineDiscountSatang, 0) + b.billDiscountSatang;
      if (discounts * 10_000 > gross * FRONT_DESK_DISCOUNT_BPS) throw new AppError("DISCOUNT_LIMIT_EXCEEDED");
    }

    // Q-0055: updated in place — package_redemption rows reference bill_line.id
    await db.update(
      billLine,
      {
        quantity,
        lineDiscountSatang: discount,
        lineDiscountReason: reason || null,
        lineTotalSatang: quantity * current.unitPriceSatang - discount,
        ...(input.performerId !== undefined ? { performerId: input.performerId } : {}),
      },
      eq(billLine.id, current.id),
    );
    if (discountChanged)
      await writeAudit(tx, ctx, {
        action: "bill.discount",
        entityType: "bill_line",
        entityId: current.id,
        before: { lineDiscountSatang: current.lineDiscountSatang, lineDiscountReason: current.lineDiscountReason },
        after: { lineDiscountSatang: discount, lineDiscountReason: reason || null },
        reason: reason || null,
      });
    const [row] = (await db.update(
      bill,
      { subtotalSatang: totals.subtotalSatang, totalSatang: totals.totalSatang, updatedAt: ctx.now },
      eq(bill.id, b.id),
    )) as BillRow[];
    return row ?? b;
  });
  return billDetail(ctx, getDb(), updated);
}
