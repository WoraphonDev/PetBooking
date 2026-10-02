import type { ClosuresCreateRequest, ClosuresCreateResponse } from "@app/contracts/endpoints/closures.create";
import { branch, branchClosure } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

// Q-0027: 05 declares 204 but also "ตอบ affected[]" — affected[] is not returned until the contract is clarified.
export async function closuresCreate(ctx: RequestContext, input: ClosuresCreateRequest): Promise<ClosuresCreateResponse> {
  requireRole(ctx, "closures.create");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  await withTx(ctx, async (tx) => {
    const [scopedBranch] = (await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    // branch_closure is a child of the tenant-checked branch above.
    await tx.insert(branchClosure).values({
      branchId: scopedBranch.id,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      scope: input.scope,
      source: "manual",
      reason: input.reason ?? null,
      createdBy: ctx.actor.id,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  });
}
