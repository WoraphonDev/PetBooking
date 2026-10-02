import type { StationsUpsertRequest, StationsUpsertResponse } from "@app/contracts/endpoints/stations.upsert";
import { branch, groomStation } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function stationsUpsert(ctx: RequestContext, input: StationsUpsertRequest): Promise<StationsUpsertResponse> {
  requireRole(ctx, "stations.upsert");
  const branchId = ctx.branchId;
  if (!branchId) throw new AppError("NOT_FOUND");
  await withTx(ctx, async (tx) => {
    const repo = tenantDb(ctx, tx);
    const [scopedBranch] = await repo.select(branch, eq(branch.id, branchId));
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    for (const { id, ...station } of input.stations) {
      if (id) {
        const [updated] = await repo.update(
          groomStation,
          { ...station, updatedAt: ctx.now },
          and(eq(groomStation.id, id), eq(groomStation.branchId, branchId)),
        );
        if (!updated) throw new AppError("NOT_FOUND");
      } else {
        await repo.insert(groomStation, { ...station, branchId, createdAt: ctx.now, updatedAt: ctx.now });
      }
    }
  });
}
