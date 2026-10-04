import type { BillsAddPaymentRequest, BillsAddPaymentResponse } from "@app/contracts/endpoints/bills.addPayment";
import { bill, creditLedger, customer, payment, paymentSlip } from "@app/db/schema";
import { applyPayment } from "@app/domain/billing/totals";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";

type BillRow = typeof bill.$inferSelect;

/**
 * 05#ep-bills.addPayment (R-15): lock the bill, check expectedPaidSatang (STALE_BILL), apply the payment
 * (cash: amount = min(tendered, due) + change; others ≤ due; credit ≤ balance), then update paid/change in one transaction.
 */
export async function billsAddPayment(
  ctx: RequestContext,
  input: BillsAddPaymentRequest & { billId: string },
): Promise<BillsAddPaymentResponse> {
  requireRole(ctx, "bills.addPayment");
  const updated = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    if (b.paidSatang !== input.expectedPaidSatang) throw new AppError("STALE_BILL");

    let c: typeof customer.$inferSelect | undefined;
    if (input.method === "credit" && b.customerId)
      [c] = (await db.select(customer, eq(customer.id, b.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    const applied = applyPayment({
      dueSatang: b.totalSatang - b.paidSatang,
      method: input.method,
      tenderedSatang: input.tenderedSatang,
      amountSatang: input.amountSatang,
      // a walk-in bill without a customer has no credit to spend
      creditBalanceSatang: c?.creditBalanceSatang ?? 0,
    });
    if ("error" in applied) throw new AppError(applied.error);

    if (input.slipId) {
      const [slip] = (await db.select(paymentSlip, eq(paymentSlip.id, input.slipId))) as (typeof paymentSlip.$inferSelect)[];
      if (!slip) throw new AppError("NOT_FOUND");
    }
    if (input.proofFileId) await commitFile(tx, ctx, input.proofFileId, "proof");

    const [p] = (await db.insert(payment, {
      branchId: b.branchId,
      billId: b.id,
      method: input.method,
      amountSatang: applied.amountSatang,
      tenderedSatang: input.method === "cash" ? (input.tenderedSatang ?? null) : null,
      slipId: input.slipId ?? null,
      proofFileId: input.proofFileId ?? null,
      reference: input.reference ?? null,
      receivedBy: ctx.actor.id,
      receivedAt: ctx.now,
    })) as (typeof payment.$inferSelect)[];
    if (!p) throw new AppError("INTERNAL");

    if (input.method === "credit" && c) {
      await db.insert(creditLedger, {
        customerId: c.id,
        deltaSatang: -applied.amountSatang,
        reason: "bill_payment",
        refType: "bill",
        refId: b.id,
        createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
        createdAt: ctx.now,
      });
      await db.update(
        customer,
        { creditBalanceSatang: c.creditBalanceSatang - applied.amountSatang, updatedAt: ctx.now },
        eq(customer.id, c.id),
      );
    }
    await writeAudit(tx, ctx, {
      action: "payment.create",
      entityType: "payment",
      entityId: p.id,
      after: {
        method: p.method,
        amountSatang: p.amountSatang,
        tenderedSatang: p.tenderedSatang,
        changeSatang: applied.changeSatang,
        billId: b.id,
      },
    });
    // change_satang = change handed back over the bill's payments (Q-0095)
    const [row] = (await db.update(
      bill,
      { paidSatang: b.paidSatang + applied.amountSatang, changeSatang: b.changeSatang + applied.changeSatang, updatedAt: ctx.now },
      eq(bill.id, b.id),
    )) as BillRow[];
    return row ?? b;
  });
  return billDetail(ctx, getDb(), updated);
}
