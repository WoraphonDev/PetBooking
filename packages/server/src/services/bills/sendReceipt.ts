import type { BillsSendReceiptRequest, BillsSendReceiptResponse } from "@app/contracts/endpoints/bills.sendReceipt";
import { bill, branch, notification } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { and, eq, like } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Re-sends the receipt of a paid bill to the customer's LINE (customer.receipt; R-18/R-19 apply at dispatch). */
export async function billsSendReceipt(ctx: RequestContext, input: BillsSendReceiptRequest): Promise<BillsSendReceiptResponse> {
  requireRole(ctx, "bills.sendReceipt");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as (typeof bill.$inferSelect)[];
    if (!b) throw new AppError("NOT_FOUND");
    // Q-0042: only a paid bill has a receipt to send
    if (b.status === "open") throw new AppError("BILL_HAS_DUE");
    if (b.status === "void") throw new AppError("BILL_NOT_OPEN");
    // walk-in sale without a customer: nobody to send to
    if (!b.customerId) throw new AppError("NOT_FOUND");
    const [br] = (await db.select(branch, eq(branch.id, b.branchId))) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");
    // 07 dedupe `receipt:{billId}:{n}` — n counts the receipts already queued for this bill (bills.close is n = 1)
    const sent = await db.select(
      notification,
      and(eq(notification.templateKey, "customer.receipt"), like(notification.dedupeKey, `receipt:${b.id}:%`)),
    );
    await enqueueNotification(
      tx,
      { ...ctx, branchId: br.id, timezone: br.timezone },
      {
        key: "customer.receipt",
        recipient: { type: "customer", id: b.customerId },
        payload: {
          receiptNo: b.receiptNo ?? "",
          total: formatTHB({ satang: b.totalSatang, decimals: "always" }),
          receiptUrl: new URL(`/liff/${br.bookingSlug}/receipts/${b.id}`, process.env.APP_BASE_URL).toString(),
        },
        dedupeKey: `receipt:${b.id}:${sent.length + 1}`,
      },
    );
  });
}
