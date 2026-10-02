import type { ClosureItem, ClosuresListRequest, ClosuresListResponse } from "@app/contracts/endpoints/closures.list";
import { branch, branchClosure } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, eq, gt, lt, type SQL } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

function closureItem(row: typeof branchClosure.$inferSelect): ClosureItem {
  return {
    id: row.id,
    branchId: row.branchId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    scope: row.scope,
    source: row.source,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Closures overlapping the local days from..to (inclusive) of the session branch. */
export async function closuresList(ctx: RequestContext, input: ClosuresListRequest): Promise<ClosuresListResponse> {
  requireRole(ctx, "closures.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [scopedBranch] = (await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  const where: SQL[] = [eq(branchClosure.branchId, scopedBranch.id)];
  if (input.from) {
    const { start } = localDayBounds({ date: input.from, timezone: scopedBranch.timezone });
    where.push(gt(branchClosure.endsAt, new Date(start)));
  }
  if (input.to) {
    const { end } = localDayBounds({ date: input.to, timezone: scopedBranch.timezone });
    where.push(lt(branchClosure.startsAt, new Date(end)));
  }
  // branch_closure has no organization_id; it is reached through the tenant-checked branch above.
  const rows = await db
    .select()
    .from(branchClosure)
    .where(and(...where))
    .orderBy(asc(branchClosure.startsAt), asc(branchClosure.id));
  return rows.map(closureItem);
}
