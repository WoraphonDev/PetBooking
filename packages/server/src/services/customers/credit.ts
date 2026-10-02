import type { CustomersCreditRequest, CustomersCreditResponse } from "@app/contracts/endpoints/customers.credit";
import { creditLedger, customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customerDetail } from "./get.ts";

/** Manual credit adjustment: credit_ledger (reason adjustment) + customer.credit_balance_satang in one transaction. */
export async function customersCredit(
  ctx: RequestContext,
  input: CustomersCreditRequest & { customerId: string },
): Promise<CustomersCreditResponse> {
  requireRole(ctx, "customers.credit");
  const reason = input.reason ?? "";
  if (reason.length < 3) throw new AppError("REASON_REQUIRED");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [current] = (await db.select(customer, eq(customer.id, input.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    if (!current) throw new AppError("NOT_FOUND");
    const balance = current.creditBalanceSatang + input.deltaSatang;
    if (balance < 0) throw new AppError("INSUFFICIENT_CREDIT");
    const [entry] = (await db.insert(creditLedger, {
      customerId: current.id,
      deltaSatang: input.deltaSatang,
      reason: "adjustment",
      createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
      createdAt: ctx.now,
    })) as (typeof creditLedger.$inferSelect)[];
    const [updated] = (await db.update(
      customer,
      { creditBalanceSatang: balance, updatedAt: ctx.now },
      eq(customer.id, current.id),
    )) as (typeof customer.$inferSelect)[];
    if (!updated) throw new AppError("NOT_FOUND");
    await writeAudit(tx, ctx, {
      action: "credit.adjust",
      entityType: "credit_ledger",
      entityId: entry?.id ?? null,
      before: { creditBalanceSatang: current.creditBalanceSatang },
      after: { creditBalanceSatang: balance },
      reason,
    });
    return customerDetail(ctx, tx, updated);
  });
}
