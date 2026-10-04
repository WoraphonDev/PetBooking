import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { ServicesListRequest, ServicesListResponse } from "@app/contracts/endpoints/services.list";
import { branch, service, serviceAddonLink, servicePrice } from "@app/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
export async function requireServiceBranch(ctx: RequestContext, tx: Executor): Promise<string> {
  if (!ctx.orgId || !ctx.branchId) throw new AppError("NOT_FOUND");
  const [found] = await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId));
  if (!found) throw new AppError("NOT_FOUND");
  return ctx.branchId;
}
export async function serviceItem(ctx: RequestContext, tx: Executor, row: typeof service.$inferSelect): Promise<ServiceItem> {
  const db = tenantDb(ctx, tx);
  const prices = (await db.select(servicePrice, eq(servicePrice.serviceId, row.id))) as (typeof servicePrice.$inferSelect)[];
  const links = (await db.select(
    serviceAddonLink,
    eq(serviceAddonLink.addonServiceId, row.id),
  )) as (typeof serviceAddonLink.$inferSelect)[];
  const {
    id,
    scope,
    category,
    nameTh,
    description,
    speciesAllowed,
    isAddon,
    addonPerDay,
    onlineBookable,
    estCostSatang,
    sortOrder,
    status,
  } = row;
  return {
    id,
    scope,
    category,
    nameTh,
    description,
    speciesAllowed,
    isAddon,
    addonPerDay,
    onlineBookable,
    estCostSatang,
    sortOrder,
    status,
    photoUrl: row.photoFileId ? await signedUrl(tx, ctx, row.photoFileId) : null,
    prices: prices.map(({ sizeTierId, coatGroup, priceSatang, durationMinutes }) => ({
      sizeTierId,
      coatGroup,
      priceSatang,
      durationMinutes,
    })),
    addonForServiceIds: links.map((l) => l.baseServiceId),
    fromPriceSatang: prices.length ? Math.min(...prices.map((p) => p.priceSatang)) : null,
  };
}
export async function servicesList(ctx: RequestContext, input: ServicesListRequest): Promise<ServicesListResponse> {
  requireRole(ctx, "services.list");
  const tx = getDb();
  const branchId = await requireServiceBranch(ctx, tx);
  const rows = (await tenantDb(ctx, tx)
    .select(
      service,
      and(
        eq(service.branchId, branchId),
        input.scope ? eq(service.scope, input.scope) : undefined,
        input.includeArchived ? undefined : eq(service.status, "active"),
      ),
    )
    .orderBy(asc(service.sortOrder), asc(service.id))) as (typeof service.$inferSelect)[];
  return Promise.all(rows.map((row) => serviceItem(ctx, tx, row)));
}
