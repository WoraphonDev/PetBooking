import type { BillsAddLineRequest, BillsAddLineResponse } from "@app/contracts/endpoints/bills.addLine";
import { bill, billLine, customer, customerPackage, packageRedemption, packageTemplate, payment, pet, staffUser } from "@app/db/schema";
import { computeBillTotals } from "@app/domain/billing/totals";
import { canRedeemPackage } from "@app/domain/package/package";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";

type BillRow = typeof bill.$inferSelect;
type LineRow = typeof billLine.$inferSelect;
type TemplateRow = typeof packageTemplate.$inferSelect;
type NewLine = Omit<typeof billLine.$inferInsert, "organizationId" | "billId" | "sortOrder">;
const invalid = (field: string, message: string) => new AppError("VALIDATION_FAILED", { fields: { [field]: message } });
/** R-14 reasons that have their own error code; the rest (not active, other service/tier) are not redeemable here */
const REDEEM_ERRORS = {
  PACKAGE_EXHAUSTED: "PACKAGE_EXHAUSTED",
  PACKAGE_EXPIRED: "PACKAGE_EXPIRED",
  PACKAGE_PET_MISMATCH: "PACKAGE_PET_MISMATCH",
} as const;

/** a pet of the bill's customer (pet is a shared table; ownership is checked through the tenant-checked customer) */
async function customerPet(tx: Tx, owner: typeof customer.$inferSelect, petId: string) {
  const [row] = await tx.select().from(pet).where(eq(pet.id, petId));
  if (!row || row.ownerProfileId !== owner.ownerProfileId) throw new AppError("NOT_FOUND");
  return row;
}

/** Adds a quick item, a package sale or a package redemption to an open bill and recomputes its totals (05#ep-bills.addLine, R-14/R-15). */
export async function billsAddLine(ctx: RequestContext, input: BillsAddLineRequest & { billId: string }): Promise<BillsAddLineResponse> {
  requireRole(ctx, "bills.addLine");
  const updated = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    if (input.performerId) {
      const [staff] = (await db.select(staffUser, and(eq(staffUser.id, input.performerId), eq(staffUser.status, "active")))) as unknown[];
      if (!staff) throw invalid("performerId", "not an active staff member");
    }
    const [owner] = b.customerId ? ((await db.select(customer, eq(customer.id, b.customerId))) as (typeof customer.$inferSelect)[]) : [];
    const performerId = input.performerId ?? null;

    let line: NewLine;
    let redeem: (typeof customerPackage.$inferSelect & { template: TemplateRow }) | null = null;
    if (input.lineType === "quick_item") {
      if (input.petId) {
        if (!owner) throw invalid("petId", "the bill has no customer");
        await customerPet(tx, owner, input.petId);
      }
      const quantity = input.quantity ?? 1;
      const unit = input.unitPriceSatang ?? 0;
      line = {
        lineType: "quick_item",
        description: input.description ?? "",
        quantity,
        unitPriceSatang: unit,
        lineTotalSatang: quantity * unit,
        petId: input.petId ?? null,
        performerId,
      };
    } else if (input.lineType === "package_sale") {
      // Q-0072: a package is sold to the bill's customer; customer_package itself is created by bills.close (03)
      if (!owner) throw invalid("packageTemplateId", "the bill has no customer");
      const [tpl] = (await db.select(
        packageTemplate,
        and(eq(packageTemplate.id, input.packageTemplateId ?? ""), eq(packageTemplate.branchId, b.branchId)),
      )) as TemplateRow[];
      if (!tpl) throw new AppError("NOT_FOUND");
      if (tpl.status !== "active") throw invalid("packageTemplateId", "the package is not on sale");
      if (tpl.shareScope === "single_pet" && !input.petId) throw invalid("petId", "required for a single-pet package");
      if (input.petId) await customerPet(tx, owner, input.petId);
      line = {
        lineType: "package_sale",
        refType: "package_template",
        refId: tpl.id,
        description: tpl.nameTh,
        quantity: 1,
        unitPriceSatang: tpl.priceSatang,
        lineTotalSatang: tpl.priceSatang,
        petId: input.petId ?? null,
        performerId,
      };
    } else {
      const [pkg] = owner
        ? ((await db
            .select(customerPackage, and(eq(customerPackage.id, input.customerPackageId ?? ""), eq(customerPackage.customerId, owner.id)))
            .for("update")) as (typeof customerPackage.$inferSelect)[])
        : [];
      if (!owner || !pkg) throw new AppError("NOT_FOUND");
      const subject = await customerPet(tx, owner, input.petId ?? "");
      const [tpl] = (await db.select(packageTemplate, eq(packageTemplate.id, pkg.templateId))) as TemplateRow[];
      if (!tpl) throw new AppError("NOT_FOUND");
      // a counter redemption has no appointment: it redeems the package's own service (and tier) for the given pet
      const check = canRedeemPackage({
        now: ctx.now.toISOString(),
        package: {
          status: pkg.status,
          sessionsUsed: pkg.sessionsUsed,
          sessionsTotal: pkg.sessionsTotal,
          expiresAt: pkg.expiresAt.toISOString(),
          serviceId: tpl.serviceId,
          sizeTierId: tpl.sizeTierId,
          shareScope: tpl.shareScope,
          petId: pkg.petId,
        },
        appointment: { serviceId: tpl.serviceId, sizeTierId: tpl.sizeTierId, petId: subject.id },
      });
      if (!check.ok) {
        const code =
          REDEEM_ERRORS[check.reason as keyof typeof REDEEM_ERRORS] ??
          // Q-0072: a non-active package reports its state
          (pkg.status === "exhausted" ? "PACKAGE_EXHAUSTED" : pkg.status === "expired" ? "PACKAGE_EXPIRED" : null);
        if (code) throw new AppError(code);
        throw invalid("customerPackageId", "the package cannot be used");
      }
      redeem = { ...pkg, template: tpl };
      line = {
        lineType: "package_redemption",
        refType: "customer_package",
        refId: pkg.id,
        description: tpl.nameTh,
        quantity: 1,
        unitPriceSatang: 0,
        lineTotalSatang: 0,
        petId: subject.id,
        performerId,
      };
    }

    const existing = (await db.select(billLine, eq(billLine.billId, b.id))) as LineRow[];
    const lines = [...existing, { ...line, lineDiscountSatang: 0, quantity: line.quantity ?? 1 }];
    const posted = (await db.select(
      payment,
      and(eq(payment.billId, b.id), eq(payment.status, "posted")),
    )) as (typeof payment.$inferSelect)[];
    const totals = computeBillTotals({
      lines: lines.map((l) => ({
        quantity: l.quantity,
        unitPriceSatang: l.unitPriceSatang,
        lineDiscountSatang: l.lineDiscountSatang ?? 0,
      })),
      billDiscountSatang: b.billDiscountSatang,
      payments: posted.map((p) => ({ method: p.method, amountSatang: p.amountSatang, status: "posted" as const })),
    });
    if ("error" in totals) throw new AppError(totals.error === "INVALID_QUANTITY" ? "VALIDATION_FAILED" : totals.error);

    const sortOrder = existing.reduce((max, l) => Math.max(max, l.sortOrder + 1), 0);
    const [row] = (await db.insert(billLine, { ...line, billId: b.id, sortOrder })) as LineRow[];
    if (!row) throw new AppError("INTERNAL");
    if (redeem) {
      await db.insert(packageRedemption, {
        customerPackageId: redeem.id,
        billLineId: row.id,
        petId: row.petId ?? "",
        performerId,
        redeemedAt: ctx.now,
      });
      // R-14 #4: exhausted once every session is used
      const sessionsUsed = redeem.sessionsUsed + 1;
      await db.update(
        customerPackage,
        { sessionsUsed, status: sessionsUsed >= redeem.sessionsTotal ? "exhausted" : redeem.status, updatedAt: ctx.now },
        eq(customerPackage.id, redeem.id),
      );
    }
    const [current] = (await db.update(
      bill,
      { subtotalSatang: totals.subtotalSatang, totalSatang: totals.totalSatang, updatedAt: ctx.now },
      eq(bill.id, b.id),
    )) as BillRow[];
    return current ?? b;
  });
  return billDetail(ctx, getDb(), updated);
}
