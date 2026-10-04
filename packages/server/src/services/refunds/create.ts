import type { RefundsCreateRequest, RefundsCreateResponse } from "@app/contracts/endpoints/refunds.create";
import { bill, booking, creditLedger, customer, refund } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";

/**
 * 05#ep-refunds.create: a refund row + audit `refund.create`; mode credit → credit_ledger `cancellation_credit` (Q-0094)
 * + customer.credit_balance. A booking whose deposit is verified moves to refunded / credited (Q-0094); other deposit
 * states are left as they are (cancel/decline/no-show already settled them).
 */
export async function refundsCreate(ctx: RequestContext, input: RefundsCreateRequest): Promise<RefundsCreateResponse> {
  requireRole(ctx, "refunds.create");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [c] = (await db.select(customer, eq(customer.id, input.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    if (!c) throw new AppError("NOT_FOUND");
    let bk: typeof booking.$inferSelect | undefined;
    if (input.bookingId) {
      [bk] = (await db.select(booking, eq(booking.id, input.bookingId))) as (typeof booking.$inferSelect)[];
      if (bk?.customerId !== c.id) throw new AppError("NOT_FOUND");
    }
    if (input.billId) {
      const [b] = (await db.select(bill, eq(bill.id, input.billId))) as (typeof bill.$inferSelect)[];
      if (!b || b.customerId !== c.id) throw new AppError("NOT_FOUND");
    }
    if (input.proofFileId) await commitFile(tx, ctx, input.proofFileId, "proof");

    const [row] = (await db.insert(refund, {
      bookingId: input.bookingId ?? null,
      billId: input.billId ?? null,
      customerId: c.id,
      amountSatang: input.amountSatang,
      mode: input.mode,
      reason: input.reason,
      proofFileId: input.proofFileId ?? null,
      createdBy: ctx.actor.id as string,
      createdAt: ctx.now,
    })) as (typeof refund.$inferSelect)[];
    if (!row) throw new AppError("INTERNAL");

    if (input.mode === "credit") {
      await db.insert(creditLedger, {
        customerId: c.id,
        deltaSatang: input.amountSatang,
        reason: "cancellation_credit",
        refType: "refund",
        refId: row.id,
        createdBy: ctx.actor.id,
        createdAt: ctx.now,
      });
      await db.update(
        customer,
        { creditBalanceSatang: c.creditBalanceSatang + input.amountSatang, updatedAt: ctx.now },
        eq(customer.id, c.id),
      );
    }
    if (bk?.depositStatus === "verified")
      await transition(tx, ctx, {
        table: booking,
        id: bk.id,
        machine: "deposit",
        to: input.mode === "credit" ? "credited" : "refunded",
        reason: input.reason,
      });

    await writeAudit(tx, ctx, {
      action: "refund.create",
      entityType: "refund",
      entityId: row.id,
      reason: input.reason,
      after: { amountSatang: row.amountSatang, mode: row.mode, bookingId: row.bookingId, billId: row.billId },
    });
    return {
      id: row.id,
      bookingId: row.bookingId,
      billId: row.billId,
      customerId: row.customerId,
      amountSatang: row.amountSatang,
      mode: row.mode,
      reason: row.reason,
      proofFileId: row.proofFileId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
