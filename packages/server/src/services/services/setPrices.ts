import type { ServicesSetPricesRequest, ServicesSetPricesResponse } from "@app/contracts/endpoints/services.setPrices";
import { service, servicePrice, sizeTier } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId } from "../availability/hotel.ts";
import { requireServiceBranch, serviceItem } from "./list.ts";

/**
 * 05#ep-services.setPrices: replaces the service's whole price table on the branch's default rate plan (R-02 reads it);
 * size tiers must be the branch's own (null = every size). Bookings keep their price snapshots.
 */
export async function servicesSetPrices(
  ctx: RequestContext,
  input: ServicesSetPricesRequest & { serviceId: string },
): Promise<ServicesSetPricesResponse> {
  requireRole(ctx, "services.setPrices");
  return withTx(ctx, async (tx) => {
    const branchId = await requireServiceBranch(ctx, tx);
    const db = tenantDb(ctx, tx);
    const [row] = (await db.select(
      service,
      and(eq(service.id, input.serviceId), eq(service.branchId, branchId)),
    )) as (typeof service.$inferSelect)[];
    if (!row) throw new AppError("NOT_FOUND");
    const tierIds = [...new Set(input.prices.flatMap((p) => (p.sizeTierId ? [p.sizeTierId] : [])))];
    if (tierIds.length) {
      const tiers = await db.select(sizeTier, and(inArray(sizeTier.id, tierIds), eq(sizeTier.branchId, branchId)));
      if (tiers.length !== tierIds.length) throw new AppError("VALIDATION_FAILED", { fields: { prices: "unknown size tier" } });
    }
    const planId = await defaultPlanId(ctx, tx, branchId);
    if (!planId) throw new AppError("NOT_FOUND", { reason: "no default rate plan" });
    // tenantDb has no delete: filter by the tenant key explicitly
    await tx
      .delete(servicePrice)
      .where(
        and(eq(servicePrice.organizationId, ctx.orgId ?? ""), eq(servicePrice.serviceId, row.id), eq(servicePrice.ratePlanId, planId)),
      );
    for (const p of input.prices)
      await db.insert(servicePrice, {
        serviceId: row.id,
        ratePlanId: planId,
        sizeTierId: p.sizeTierId ?? null,
        coatGroup: p.coatGroup,
        priceSatang: p.priceSatang,
        durationMinutes: p.durationMinutes,
      });
    return serviceItem(ctx, tx, row);
  });
}
