import type { StationsListRequest, StationsListResponse } from "@app/contracts/endpoints/stations.list";
import { branch, groomStation } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function stationsList(ctx: RequestContext, _input: StationsListRequest): Promise<StationsListResponse> {
  requireRole(ctx, "stations.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const repo = tenantDb(ctx, getDb());
  const [scopedBranch] = await repo.select(branch, eq(branch.id, ctx.branchId));
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  const rows = (await repo.select(groomStation, eq(groomStation.branchId, ctx.branchId))) as (typeof groomStation.$inferSelect)[];
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
}
