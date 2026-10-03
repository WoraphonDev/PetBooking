import type { BillsRemoveLineRequest, BillsRemoveLineResponse } from "@app/contracts/endpoints/bills.removeLine";
import { bill, billLine, customerPackage, packageRedemption, payment } from "@app/db/schema";
import { computeBillTotals } from "@app/domain/billing/totals";
import { and, eq, isNull } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";

type BillRow = typeof bill.$inferSelect;
type LineRow = typeof billLine.$inferSelect;
/** lines created by bills.addLine; every other line comes from a booking child and is removed by cancelling that child */
const COUNTER_REFS = [null, "package_template", "customer_package"];

/** R-15 totals of a bill from its current lines, posted payments and the given bill discount (BILL_DISCOUNT_TOO_LARGE). */
export async function recomputeBill(ctx: RequestContext, tx: Tx, b: BillRow, billDiscountSatang = b.billDiscountSatang) {
  const db = tenantDb(ctx, tx);
  const lines = (await db.select(billLine, eq(billLine.billId, b.id))) as LineRow[];
  const posted = (await db.select(payment, and(eq(payment.billId, b.id), eq(payment.status, "posted")))) as (typeof payment.$inferSelect)[];
  const totals = computeBillTotals({
    lines: lines.map((l) => ({ quantity: l.quantity, unitPriceSatang: l.unitPriceSatang, lineDiscountSatang: l.lineDiscountSatang })),
    billDiscountSatang,
    payments: posted.map((p) => ({ method: p.method, amountSatang: p.amountSatang, status: "posted" as const })),
  });
  if ("error" in totals) throw new AppError(totals.error === "INVALID_QUANTITY" ? "VALIDATION_FAILED" : totals.error);
  return { lines, totals };
}

/** Removes a counter line (quick item / package sale / counter redemption) from an open bill (05#ep-bills.removeLine). */
export async function billsRemoveLine(ctx: RequestContext, input: BillsRemoveLineRequest): Promise<BillsRemoveLineResponse> {
  requireRole(ctx, "bills.removeLine");
  const updated = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [line] = (await db.select(billLine, eq(billLine.id, input.lineId))) as LineRow[];
    if (!line) throw new AppError("NOT_FOUND");
    const [b] = (await db.select(bill, eq(bill.id, line.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    // Q-0073: booking lines cannot be removed here — cancel the booking child instead
    if (!COUNTER_REFS.includes(line.refType))
      throw new AppError("VALIDATION_FAILED", { fields: { lineId: "a booking line: cancel the booking item instead" } });

    // a counter redemption gives its session back (R-14)
    const redemptions = (await db.select(
      packageRedemption,
      and(eq(packageRedemption.billLineId, line.id), isNull(packageRedemption.reversedAt)),
    )) as (typeof packageRedemption.$inferSelect)[];
    for (const r of redemptions) {
      const [pkg] = (await db
        .select(customerPackage, eq(customerPackage.id, r.customerPackageId))
        .for("update")) as (typeof customerPackage.$inferSelect)[];
      if (pkg) {
        const sessionsUsed = Math.max(0, pkg.sessionsUsed - 1);
        await db.update(
          customerPackage,
          {
            sessionsUsed,
            status: pkg.status === "exhausted" && sessionsUsed < pkg.sessionsTotal ? "active" : pkg.status,
            updatedAt: ctx.now,
          },
          eq(customerPackage.id, pkg.id),
        );
      }
    }
    // tenantDb has no delete: scope by organization_id explicitly
    const orgId = ctx.orgId ?? "";
    if (redemptions.length)
      await tx.delete(packageRedemption).where(and(eq(packageRedemption.organizationId, orgId), eq(packageRedemption.billLineId, line.id)));
    await tx.delete(billLine).where(and(eq(billLine.organizationId, orgId), eq(billLine.id, line.id)));

    const { totals } = await recomputeBill(ctx, tx, b);
    const [row] = (await db.update(
      bill,
      { subtotalSatang: totals.subtotalSatang, totalSatang: totals.totalSatang, updatedAt: ctx.now },
      eq(bill.id, b.id),
    )) as BillRow[];
    return row ?? b;
  });
  return billDetail(ctx, getDb(), updated);
}
