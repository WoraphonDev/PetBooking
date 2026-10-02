import type {
  CustomersReliabilityOverrideRequest,
  CustomersReliabilityOverrideResponse,
} from "@app/contracts/endpoints/customers.reliabilityOverride";
import { customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customerDetail } from "./get.ts";

/** Shop-set reliability level (wins over R-09); level null/absent = back to the computed value. */
export async function customersReliabilityOverride(
  ctx: RequestContext,
  input: CustomersReliabilityOverrideRequest & { customerId: string },
): Promise<CustomersReliabilityOverrideResponse> {
  requireRole(ctx, "customers.reliabilityOverride");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [current] = (await db.select(customer, eq(customer.id, input.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    if (!current) throw new AppError("NOT_FOUND");
    const level = input.level ?? null;
    const [updated] = (await db.update(
      customer,
      { reliabilityOverride: level, updatedAt: ctx.now },
      eq(customer.id, current.id),
    )) as (typeof customer.$inferSelect)[];
    if (!updated) throw new AppError("NOT_FOUND");
    await writeAudit(tx, ctx, {
      action: "customer.reliability_override",
      entityType: "customer",
      entityId: current.id,
      before: { reliabilityOverride: current.reliabilityOverride },
      after: { reliabilityOverride: level },
      reason: input.reason,
    });
    return customerDetail(ctx, tx, updated);
  });
}
