import type { PackageTemplatesUpsertRequest, PackageTemplatesUpsertResponse } from "@app/contracts/endpoints/packageTemplates.upsert";
import { branch, packageTemplate, service, sizeTier } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchPackageTemplates } from "./list.ts";

/** Creates (no id) or updates (id) the given templates; templates not sent are left as they are (archive via status). */
export async function packageTemplatesUpsert(
  ctx: RequestContext,
  input: PackageTemplatesUpsertRequest,
): Promise<PackageTemplatesUpsertResponse> {
  requireRole(ctx, "packageTemplates.upsert");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");

    const ids = input.items.flatMap((i) => (i.id ? [i.id] : []));
    if (ids.length) {
      const found = await db.select(packageTemplate, and(eq(packageTemplate.branchId, scopedBranch.id), inArray(packageTemplate.id, ids)));
      if (found.length !== ids.length) throw new AppError("NOT_FOUND");
    }
    const serviceIds = [...new Set(input.items.map((i) => i.serviceId))];
    const services = serviceIds.length
      ? ((await db.select(
          service,
          and(eq(service.branchId, scopedBranch.id), inArray(service.id, serviceIds)),
        )) as (typeof service.$inferSelect)[])
      : [];
    if (services.length !== serviceIds.length) throw new AppError("NOT_FOUND");
    const tierIds = [...new Set(input.items.flatMap((i) => (i.sizeTierId ? [i.sizeTierId] : [])))];
    if (tierIds.length) {
      const tiers = await db.select(sizeTier, and(eq(sizeTier.branchId, scopedBranch.id), inArray(sizeTier.id, tierIds)));
      if (tiers.length !== tierIds.length) throw new AppError("NOT_FOUND");
    }
    // 05 validation: the service must be a main (not add-on) grooming service
    const fields: Record<string, string> = {};
    input.items.forEach((item, i) => {
      const s = services.find((x) => x.id === item.serviceId);
      if (s && (s.scope !== "grooming" || s.isAddon)) fields[`items.${i}.serviceId`] = "must be a main grooming service";
    });
    if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

    for (const item of input.items) {
      const values = {
        nameTh: item.nameTh.trim(),
        serviceId: item.serviceId,
        sizeTierId: item.sizeTierId ?? null,
        sessionsCount: item.sessionsCount,
        priceSatang: item.priceSatang,
        validityDays: item.validityDays,
        shareScope: item.shareScope,
        status: item.status,
        updatedAt: ctx.now,
      };
      if (item.id) await db.update(packageTemplate, values, eq(packageTemplate.id, item.id));
      else await db.insert(packageTemplate, { ...values, branchId: scopedBranch.id, createdAt: ctx.now });
    }
    return branchPackageTemplates(ctx, tx, scopedBranch);
  });
}
