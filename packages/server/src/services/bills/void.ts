import type { BillsVoidRequest, BillsVoidResponse } from "@app/contracts/endpoints/bills.void";
import {
  bill,
  billLine,
  booking,
  commissionEntry,
  creditLedger,
  customer,
  customerPackage,
  packageRedemption,
  payment,
} from "@app/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { billDetail } from "./open.ts";

type BillRow = typeof bill.$inferSelect;
type BookingRow = typeof booking.$inferSelect;

/** credit_ledger `void_reversal` + customer.credit_balance in the same transaction */
async function reverseCredit(ctx: RequestContext, tx: Tx, customerId: string, deltaSatang: number, refId: string) {
  const db = tenantDb(ctx, tx);
  const [c] = (await db.select(customer, eq(customer.id, customerId)).for("update")) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  await db.insert(creditLedger, {
    customerId: c.id,
    deltaSatang,
    reason: "void_reversal",
    refType: "bill",
    refId,
    createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
    createdAt: ctx.now,
  });
  await db.update(customer, { creditBalanceSatang: c.creditBalanceSatang + deltaSatang, updatedAt: ctx.now }, eq(customer.id, c.id));
}

/** Voids a bill (owner): open without posted payments, or paid with everything it did undone (05#ep-bills.void, 03 sm-bill). */
export async function billsVoid(ctx: RequestContext, input: BillsVoidRequest & { billId: string }): Promise<BillsVoidResponse> {
  requireRole(ctx, "bills.void");
  const voided = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status === "void") throw new AppError("BILL_NOT_OPEN");
    const posted = (await db.select(
      payment,
      and(eq(payment.billId, b.id), eq(payment.status, "posted")),
    )) as (typeof payment.$inferSelect)[];
    // 03: an open bill can be voided only before any payment is posted (void the payments first)
    if (b.status === "open" && posted.length)
      throw new AppError("VALIDATION_FAILED", { fields: { billId: "void the posted payments first" } });
    const reason = input.reason.trim();
    const bookings = (await db.select(booking, eq(booking.billId, b.id))) as BookingRow[];
    const lineIds = ((await db.select(billLine, eq(billLine.billId, b.id))) as (typeof billLine.$inferSelect)[]).map((l) => l.id);

    // R-13 #6: commissions are reversed, never deleted
    await db.update(
      commissionEntry,
      { status: "reversed", reversedAt: ctx.now },
      and(eq(commissionEntry.billId, b.id), eq(commissionEntry.status, "earned")),
    );
    // R-14 #5: redeemed sessions come back
    const redemptions = lineIds.length
      ? ((await db.select(
          packageRedemption,
          and(inArray(packageRedemption.billLineId, lineIds), isNull(packageRedemption.reversedAt)),
        )) as (typeof packageRedemption.$inferSelect)[])
      : [];
    for (const r of redemptions) {
      await db.update(packageRedemption, { reversedAt: ctx.now }, eq(packageRedemption.id, r.id));
      const [pkg] = (await db
        .select(customerPackage, eq(customerPackage.id, r.customerPackageId))
        .for("update")) as (typeof customerPackage.$inferSelect)[];
      if (!pkg) continue;
      const sessionsUsed = Math.max(0, pkg.sessionsUsed - 1);
      await db.update(
        customerPackage,
        {
          sessionsUsed,
          status: pkg.status === "exhausted" && sessionsUsed < pkg.sessionsTotal && ctx.now <= pkg.expiresAt ? "active" : pkg.status,
          updatedAt: ctx.now,
        },
        eq(customerPackage.id, pkg.id),
      );
    }
    // packages sold on this bill are void
    const sold = (await db.select(customerPackage, eq(customerPackage.purchasedBillId, b.id))) as (typeof customerPackage.$inferSelect)[];
    for (const pkg of sold.filter((p) => p.status !== "void"))
      await transition(tx, ctx, { table: customerPackage, id: pkg.id, machine: "customer_package", to: "void" });

    // credit spent on the bill goes back; credit earned by closing it (unused deposits) is taken back
    for (const p of posted.filter((x) => x.method === "credit"))
      if (b.customerId) await reverseCredit(ctx, tx, b.customerId, p.amountSatang, b.id);
    const earned = bookings.length
      ? ((await db.select(
          creditLedger,
          and(
            eq(creditLedger.reason, "deposit_credit"),
            inArray(
              creditLedger.refId,
              bookings.map((bk) => bk.id),
            ),
          ),
        )) as (typeof creditLedger.$inferSelect)[])
      : [];
    for (const e of earned) await reverseCredit(ctx, tx, e.customerId, -e.deltaSatang, b.id);

    // every payment is voided; real money goes back through refunds.create
    if (posted.length)
      await db.update(
        payment,
        { status: "voided", voidedAt: ctx.now, voidedBy: ctx.actor.id, voidReason: reason },
        and(eq(payment.billId, b.id), eq(payment.status, "posted")),
      );
    // bookings return to confirmed and leave the bill; an applied deposit is available again
    for (const bk of bookings) {
      if (bk.status === "closed") await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "confirmed", reason });
      if (bk.depositStatus === "applied")
        await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "verified", reason });
    }
    if (bookings.length)
      await db.update(
        booking,
        { billId: null, updatedAt: ctx.now },
        inArray(
          booking.id,
          bookings.map((bk) => bk.id),
        ),
      );

    const row = (await transition(tx, ctx, {
      table: bill,
      id: b.id,
      machine: "bill",
      to: "void",
      extraSet: { voidedAt: ctx.now, voidedBy: ctx.actor.id, voidReason: reason },
    })) as BillRow;
    await writeAudit(tx, ctx, {
      action: "bill.void",
      entityType: "bill",
      entityId: b.id,
      before: { status: b.status },
      after: { status: "void", receiptNo: b.receiptNo, totalSatang: b.totalSatang },
      reason,
    });
    return row;
  });
  return billDetail(ctx, getDb(), voided);
}
