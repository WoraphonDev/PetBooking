import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import type { SizeTiersListRequest, SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { sizeTier } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export function sizeTierItem(row: typeof sizeTier.$inferSelect): SizeTierItem {
  return {
    id: row.id,
    species: row.species,
    code: row.code,
    labelTh: row.labelTh,
    minWeightGrams: row.minWeightGrams,
    maxWeightGrams: row.maxWeightGrams,
    sortOrder: row.sortOrder,
  };
}

export async function sizeTiersList(ctx: RequestContext, _input: SizeTiersListRequest): Promise<SizeTiersListResponse> {
  requireRole(ctx, "sizeTiers.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const rows = (await tenantDb(ctx, getDb())
    .select(sizeTier, eq(sizeTier.branchId, ctx.branchId))
    .orderBy(asc(sizeTier.species), asc(sizeTier.sortOrder), asc(sizeTier.minWeightGrams))) as (typeof sizeTier.$inferSelect)[];
  return rows.map(sizeTierItem);
}
