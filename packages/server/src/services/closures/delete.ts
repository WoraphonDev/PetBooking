import type { ClosuresDeleteRequest, ClosuresDeleteResponse } from "@app/contracts/endpoints/closures.delete";
import { branch, branchClosure } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function closuresDelete(ctx: RequestContext, input: ClosuresDeleteRequest): Promise<ClosuresDeleteResponse> {
  requireRole(ctx, "closures.delete");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  await withTx(ctx, async (tx) => {
    const [scopedBranch] = (await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    // branch_closure is a child of the tenant-checked branch above.
    const deleted = await tx
      .delete(branchClosure)
      .where(and(eq(branchClosure.id, input.closureId), eq(branchClosure.branchId, scopedBranch.id)))
      .returning({ id: branchClosure.id });
    if (deleted.length === 0) throw new AppError("NOT_FOUND");
  });
}
