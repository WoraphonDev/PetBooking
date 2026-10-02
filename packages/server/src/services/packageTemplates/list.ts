import type { PackageTemplateItem } from "@app/contracts/dto/package-template-item";
import type { PackageTemplatesListRequest, PackageTemplatesListResponse } from "@app/contracts/endpoints/packageTemplates.list";
import { branch, packageTemplate, service } from "@app/db/schema";
import { packageTerms } from "@app/domain/package/package";
import { asc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** The branch's package templates (all statuses), oldest first. */
export async function branchPackageTemplates(
  ctx: RequestContext,
  db: Executor,
  scoped: typeof branch.$inferSelect,
): Promise<PackageTemplateItem[]> {
  const rows = (await tenantDb(ctx, db)
    .select(packageTemplate, eq(packageTemplate.branchId, scoped.id))
    .orderBy(asc(packageTemplate.createdAt), asc(packageTemplate.id))) as (typeof packageTemplate.$inferSelect)[];
  if (rows.length === 0) return [];
  const services = (await tenantDb(ctx, db).select(
    service,
    inArray(service.id, [...new Set(rows.map((r) => r.serviceId))]),
  )) as (typeof service.$inferSelect)[];
  const serviceName = new Map(services.map((s) => [s.id, s.nameTh]));
  return rows.map((r) => ({
    id: r.id,
    nameTh: r.nameTh,
    serviceId: r.serviceId,
    serviceName: serviceName.get(r.serviceId) ?? "",
    sizeTierId: r.sizeTierId,
    sessionsCount: r.sessionsCount,
    priceSatang: r.priceSatang,
    validityDays: r.validityDays,
    shareScope: r.shareScope,
    status: r.status,
    // R-14: unit value does not depend on the purchase time
    unitValueSatang: packageTerms({
      priceSatang: r.priceSatang,
      sessionsCount: r.sessionsCount,
      validityDays: r.validityDays,
      purchasedAt: ctx.now.toISOString(),
      timezone: scoped.timezone,
    }).unitValueSatang,
  }));
}

export async function packageTemplatesList(
  ctx: RequestContext,
  _input: PackageTemplatesListRequest,
): Promise<PackageTemplatesListResponse> {
  requireRole(ctx, "packageTemplates.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [scopedBranch] = (await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  return branchPackageTemplates(ctx, db, scopedBranch);
}
