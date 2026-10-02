import type { SurchargeTypeItem } from "@app/contracts/dto/surcharge-type-item";
import type { SurchargeTypesListRequest, SurchargeTypesListResponse } from "@app/contracts/endpoints/surchargeTypes.list";
import { branch, surchargeType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export function surchargeTypeItem(row: typeof surchargeType.$inferSelect): SurchargeTypeItem {
  return { id: row.id, nameTh: row.nameTh, defaultAmountSatang: row.defaultAmountSatang, status: row.status };
}

export async function surchargeTypesList(ctx: RequestContext, _input: SurchargeTypesListRequest): Promise<SurchargeTypesListResponse> {
  requireRole(ctx, "surchargeTypes.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const repo = tenantDb(ctx, getDb());
  const [scopedBranch] = await repo.select(branch, eq(branch.id, ctx.branchId));
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  const rows = (await repo.select(surchargeType, eq(surchargeType.branchId, ctx.branchId))) as (typeof surchargeType.$inferSelect)[];
  return rows.map(surchargeTypeItem);
}
