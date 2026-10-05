import type { ServicesSetAddonLinksRequest, ServicesSetAddonLinksResponse } from "@app/contracts/endpoints/services.setAddonLinks";
import { service, serviceAddonLink } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { requireServiceBranch, serviceItem } from "./list.ts";
export async function servicesSetAddonLinks(
  ctx: RequestContext,
  input: ServicesSetAddonLinksRequest & { serviceId: string },
): Promise<ServicesSetAddonLinksResponse> {
  requireRole(ctx, "services.setAddonLinks");
  return withTx(ctx, async (tx) => {
    const branchId = await requireServiceBranch(ctx, tx);
    const db = tenantDb(ctx, tx);
    const [addon] = (await db.select(
      service,
      and(eq(service.id, input.serviceId), eq(service.branchId, branchId)),
    )) as (typeof service.$inferSelect)[];
    if (!addon) throw new AppError("NOT_FOUND");
    if (!addon.isAddon) throw new AppError("VALIDATION_FAILED");
    const baseIds = [...new Set(input.baseServiceIds)];
    const bases = baseIds.length
      ? ((await db.select(service, and(inArray(service.id, baseIds), eq(service.branchId, branchId)))) as (typeof service.$inferSelect)[])
      : [];
    if (bases.length !== baseIds.length) throw new AppError("NOT_FOUND");
    // links point from an add-on to main services of its own scope (02#tbl-service_addon_link)
    if (bases.some((b) => b.isAddon || b.scope !== addon.scope)) throw new AppError("VALIDATION_FAILED");
    await tx
      .delete(serviceAddonLink)
      .where(and(eq(serviceAddonLink.organizationId, ctx.orgId ?? ""), eq(serviceAddonLink.addonServiceId, addon.id)));
    if (baseIds.length)
      await db.insert(
        serviceAddonLink,
        baseIds.map((baseServiceId) => ({ addonServiceId: addon.id, baseServiceId, createdAt: ctx.now })),
      );
    return serviceItem(ctx, tx, addon);
  });
}
