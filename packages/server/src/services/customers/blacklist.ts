import type { CustomersBlacklistRequest, CustomersBlacklistResponse } from "@app/contracts/endpoints/customers.blacklist";
import { customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customerDetail } from "./get.ts";

/** Blocks / unblocks online booking for a customer (audit customer.blacklist). */
export async function customersBlacklist(
  ctx: RequestContext,
  input: CustomersBlacklistRequest & { customerId: string },
): Promise<CustomersBlacklistResponse> {
  requireRole(ctx, "customers.blacklist");
  const reason = input.reason ?? "";
  // 05: required when blacklisting; R-27 writeAudit also requires it for every customer.blacklist entry (Q-0034)
  if (reason.length < 3) throw new AppError("REASON_REQUIRED");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [current] = (await db.select(customer, eq(customer.id, input.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    if (!current) throw new AppError("NOT_FOUND");
    const after = { blacklisted: input.blacklisted, blacklistReason: input.blacklisted ? reason : null };
    const [updated] = (await db.update(
      customer,
      { ...after, updatedAt: ctx.now },
      eq(customer.id, current.id),
    )) as (typeof customer.$inferSelect)[];
    if (!updated) throw new AppError("NOT_FOUND");
    await writeAudit(tx, ctx, {
      action: "customer.blacklist",
      entityType: "customer",
      entityId: current.id,
      before: { blacklisted: current.blacklisted, blacklistReason: current.blacklistReason },
      after,
      reason,
    });
    return customerDetail(ctx, tx, updated);
  });
}
