import type { BillsVoidPaymentRequest, BillsVoidPaymentResponse } from "@app/contracts/endpoints/bills.voidPayment";
import { bill, creditLedger, customer, payment } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";

type BillRow = typeof bill.$inferSelect;
type PaymentRow = typeof payment.$inferSelect;

/** Voids a posted payment of an open bill; a credit payment goes back to the customer's credit (05#ep-bills.voidPayment). */
export async function billsVoidPayment(
  ctx: RequestContext,
  input: BillsVoidPaymentRequest & { paymentId: string },
): Promise<BillsVoidPaymentResponse> {
  requireRole(ctx, "bills.voidPayment");
  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) throw new AppError("REASON_REQUIRED");
  const updated = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [p] = (await db.select(payment, eq(payment.id, input.paymentId)).for("update")) as PaymentRow[];
    // Q-0073: deposits waiting on a booking (no bill) are not voided here
    if (!p?.billId) throw new AppError("NOT_FOUND");
    const [b] = (await db.select(bill, eq(bill.id, p.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    if (p.status !== "posted") throw new AppError("VALIDATION_FAILED", { fields: { paymentId: "payment already voided" } });

    await db.update(payment, { status: "voided", voidedAt: ctx.now, voidedBy: ctx.actor.id, voidReason: reason }, eq(payment.id, p.id));
    if (p.method === "credit" && b.customerId) {
      const [c] = (await db.select(customer, eq(customer.id, b.customerId)).for("update")) as (typeof customer.$inferSelect)[];
      if (!c) throw new AppError("NOT_FOUND");
      await db.insert(creditLedger, {
        customerId: c.id,
        deltaSatang: p.amountSatang,
        reason: "void_reversal",
        refType: "bill",
        refId: b.id,
        createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
        createdAt: ctx.now,
      });
      await db.update(customer, { creditBalanceSatang: c.creditBalanceSatang + p.amountSatang, updatedAt: ctx.now }, eq(customer.id, c.id));
    }
    await writeAudit(tx, ctx, {
      action: "payment.void",
      entityType: "payment",
      entityId: p.id,
      before: { status: "posted" },
      after: { status: "voided", method: p.method, amountSatang: p.amountSatang },
      reason,
    });
    const [row] = (await db.update(
      bill,
      { paidSatang: b.paidSatang - p.amountSatang, updatedAt: ctx.now },
      eq(bill.id, b.id),
    )) as BillRow[];
    return row ?? b;
  });
  return billDetail(ctx, getDb(), updated);
}
