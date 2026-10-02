import type { BillsReceiptRequest, BillsReceiptResponse } from "@app/contracts/endpoints/bills.receipt";
import { bill, billLine, branch, customer, ownerProfile, payment, staffUser } from "@app/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customersPackages } from "../customers/packages.ts";

type BillRow = typeof bill.$inferSelect;

/** 05#dto-Receipt for a tenant-checked bill (also used by bills.sendReceipt). */
export async function receiptOf(ctx: RequestContext, tx: Executor, b: BillRow): Promise<BillsReceiptResponse> {
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, b.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const lines = (await db
    .select(billLine, eq(billLine.billId, b.id))
    .orderBy(asc(billLine.sortOrder), asc(billLine.createdAt), asc(billLine.id))) as (typeof billLine.$inferSelect)[];
  const payments = (await db
    .select(payment, and(eq(payment.billId, b.id), eq(payment.status, "posted")))
    .orderBy(asc(payment.receivedAt), asc(payment.id))) as (typeof payment.$inferSelect)[];
  const cashierId = b.closedBy ?? b.openedBy;
  const [cashier] = (await db.select(staffUser, eq(staffUser.id, cashierId))) as (typeof staffUser.$inferSelect)[];
  const [cust] = b.customerId ? ((await db.select(customer, eq(customer.id, b.customerId))) as (typeof customer.$inferSelect)[]) : [];
  // owner_profile is shared across shops; reached through the tenant-checked customer
  const [owner] = cust ? await tx.select().from(ownerProfile).where(eq(ownerProfile.id, cust.ownerProfileId)) : [];
  const address = [br.addressLine, br.subdistrict, br.district, br.province, br.postalCode].filter((p) => p?.trim()).join(" ");
  const packages = cust ? await customersPackages(ctx, { customerId: cust.id }) : [];

  return {
    shopName: br.name,
    shopAddress: address || null,
    shopPhone: br.phone,
    logoUrl: null, // Q-0042: signed URL of branch.logo_file_id once T-0038 storage lands
    receiptNo: b.receiptNo,
    closedAt: b.closedAt?.toISOString() ?? null,
    customerName: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") : null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceSatang: l.unitPriceSatang,
      lineDiscountSatang: l.lineDiscountSatang,
      lineTotalSatang: l.lineTotalSatang,
    })),
    subtotalSatang: b.subtotalSatang,
    billDiscountSatang: b.billDiscountSatang,
    totalSatang: b.totalSatang,
    payments: payments.map((p) => ({ method: p.method, amountSatang: p.amountSatang })),
    changeSatang: b.changeSatang,
    cashierName: cashier?.displayName ?? null,
    status: b.status,
    packagesRemaining: packages.filter((p) => p.status === "active"),
  };
}

/** Receipt data for printing (C-20), any bill status: receiptNo/closedAt stay null while open (Q-0042). */
export async function billsReceipt(ctx: RequestContext, input: BillsReceiptRequest): Promise<BillsReceiptResponse> {
  requireRole(ctx, "bills.receipt");
  const tx = getDb();
  const [b] = (await tenantDb(ctx, tx).select(bill, eq(bill.id, input.billId))) as BillRow[];
  if (!b) throw new AppError("NOT_FOUND");
  return receiptOf(ctx, tx, b);
}
