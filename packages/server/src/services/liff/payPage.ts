import type { PaymentInstruction } from "@app/contracts/dto/payment-instruction";
import type { LiffPayPageRequest, LiffPayPageResponse } from "@app/contracts/endpoints/liff.payPage";
import { bill, branch } from "@app/db/schema";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type BillRow = typeof bill.$inferSelect;

/** The signed-in customer's open bill in this branch: someone else's / another branch's → NOT_FOUND, not open → BILL_NOT_OPEN (Q-1035). */
export async function requireMyOpenBill(ctx: RequestContext, db: Executor, billId: string): Promise<BillRow> {
  const [b] = (await tenantDb(ctx, db).select(bill, eq(bill.id, billId))) as BillRow[];
  if (!b || ctx.actor.type !== "customer" || !ctx.actor.id || b.customerId !== ctx.actor.id || b.branchId !== ctx.branchId)
    throw new AppError("NOT_FOUND");
  if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
  return b;
}

/** R-30 PaymentInstruction for the bill's amount due, as bills.promptpayQr / liff.payUploadSlip build it. */
export async function billPaymentInstruction(ctx: RequestContext, db: Executor, b: BillRow): Promise<PaymentInstruction> {
  const [br] = (await tenantDb(ctx, db).select(branch, eq(branch.id, b.branchId))) as (typeof branch.$inferSelect)[];
  if (!br?.promptpayType || !br.promptpayId) throw new AppError("PROMPTPAY_NOT_CONFIGURED");
  const due = Math.max(b.totalSatang - b.paidSatang, 0);
  // nothing due → a QR without an amount (R-30 step 1: 010211)
  const qr = promptPayPayload({ type: br.promptpayType, id: br.promptpayId, amountSatang: due > 0 ? due : null });
  if ("error" in qr) throw new AppError("PROMPTPAY_NOT_CONFIGURED");
  return {
    amountSatang: due,
    promptpayPayload: qr.payload,
    accountName: br.promptpayAccountName,
    promptpayIdMasked: br.promptpayId.slice(-3),
    expiresAt: null,
  };
}

/** 05#ep-liff.payPage (L-14): the balance due on the customer's open bill. */
export async function liffPayPage(ctx: RequestContext, input: LiffPayPageRequest): Promise<LiffPayPageResponse> {
  const db = getDb();
  return billPaymentInstruction(ctx, db, await requireMyOpenBill(ctx, db, input.billId));
}
