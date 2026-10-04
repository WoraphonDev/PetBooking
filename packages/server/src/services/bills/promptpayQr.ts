import type { BillsPromptpayQrRequest, BillsPromptpayQrResponse } from "@app/contracts/endpoints/bills.promptpayQr";
import { bill, branch } from "@app/db/schema";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** 05#ep-bills.promptpayQr: R-30 payload for the bill's amount due on the branch's PromptPay account. */
export async function billsPromptpayQr(ctx: RequestContext, input: BillsPromptpayQrRequest): Promise<BillsPromptpayQrResponse> {
  requireRole(ctx, "bills.promptpayQr");
  const db = tenantDb(ctx, getDb());
  const [b] = (await db.select(bill, eq(bill.id, input.billId))) as (typeof bill.$inferSelect)[];
  if (!b) throw new AppError("NOT_FOUND");
  const [br] = (await db.select(branch, eq(branch.id, b.branchId))) as (typeof branch.$inferSelect)[];
  if (!br?.promptpayType || !br.promptpayId) throw new AppError("PROMPTPAY_NOT_CONFIGURED");
  const due = Math.max(b.totalSatang - b.paidSatang, 0);
  // nothing due → a QR without an amount (R-30 step 1: 010211)
  const qr = promptPayPayload({ type: br.promptpayType, id: br.promptpayId, amountSatang: due > 0 ? due : null });
  // a stored id that R-30 rejects cannot produce a QR either
  if ("error" in qr) throw new AppError("PROMPTPAY_NOT_CONFIGURED");
  return {
    amountSatang: due,
    promptpayPayload: qr.payload,
    accountName: br.promptpayAccountName,
    promptpayIdMasked: br.promptpayId.slice(-3),
    expiresAt: null,
  };
}
