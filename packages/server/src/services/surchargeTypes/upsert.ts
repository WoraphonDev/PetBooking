import type { SurchargeTypesUpsertRequest, SurchargeTypesUpsertResponse } from "@app/contracts/endpoints/surchargeTypes.upsert";
import { branch, surchargeType } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { surchargeTypeItem } from "./list.ts";

export async function surchargeTypesUpsert(ctx: RequestContext, input: SurchargeTypesUpsertRequest): Promise<SurchargeTypesUpsertResponse> {
  requireRole(ctx, "surchargeTypes.upsert");
  const branchId = ctx.branchId;
  if (!branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const repo = tenantDb(ctx, tx);
    const [scopedBranch] = await repo.select(branch, eq(branch.id, branchId));
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    const saved: SurchargeTypesUpsertResponse = [];
    for (const { id, ...item } of input.items) {
      const [row] = id
        ? await repo.update(
            surchargeType,
            { ...item, updatedAt: ctx.now },
            and(eq(surchargeType.id, id), eq(surchargeType.branchId, branchId)),
          )
        : await repo.insert(surchargeType, { ...item, branchId, createdAt: ctx.now, updatedAt: ctx.now });
      if (!row) throw new AppError("NOT_FOUND");
      saved.push(surchargeTypeItem(row));
    }
    return saved;
  });
}
