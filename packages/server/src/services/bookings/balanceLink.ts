import type { BookingsBalanceLinkRequest, BookingsBalanceLinkResponse } from "@app/contracts/endpoints/bookings.balanceLink";
import { bill, booking, branch } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Pay link for the booking's open bill (L-14); optionally pushes it to the customer (customer.balance_link). */
export async function bookingsBalanceLink(
  ctx: RequestContext,
  input: BookingsBalanceLinkRequest & { bookingId: string },
): Promise<BookingsBalanceLinkResponse> {
  requireRole(ctx, "bookings.balanceLink");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [bk] = (await db.select(booking, eq(booking.id, input.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const [open] = bk.billId ? ((await db.select(bill, eq(bill.id, bk.billId))) as (typeof bill.$inferSelect)[]) : [];
    // Q-0040: no bill yet, or it is already paid/void
    if (!open || open.status !== "open") throw new AppError("BILL_NOT_OPEN");
    const [br] = (await db.select(branch, eq(branch.id, open.branchId))) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");
    const url = new URL(`/liff/${br.bookingSlug}/pay/${open.id}`, process.env.APP_BASE_URL).toString();
    const amountSatang = open.totalSatang - open.paidSatang;
    if (input.send)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: br.id, timezone: br.timezone },
        {
          key: "customer.balance_link",
          recipient: { type: "customer", id: bk.customerId },
          payload: { amount: formatTHB({ satang: amountSatang, decimals: "always" }), payUrl: url },
          dedupeKey: `balance_link:${open.id}:${amountSatang}`,
        },
      );
    return { url, amountSatang };
  });
}
