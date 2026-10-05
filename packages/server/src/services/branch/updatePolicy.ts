import type { BranchPolicy } from "@app/contracts/dto/branch-policy";
import type { BranchUpdatePolicyRequest, BranchUpdatePolicyResponse } from "@app/contracts/endpoints/branch.updatePolicy";
import { branchPolicy, vaccineType } from "@app/db/schema";
import { eq, inArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { branchRow, branchSettings } from "./get.ts";

/**
 * 05#ep-branch.updatePolicy: partial update of branch_policy (02 CHECKs in the contract; a percent deposit ≤ 100 here),
 * vaccine codes must be vaccine_type rows of that species, audit policy.update with the changed keys. Existing bookings keep
 * their policy_snapshot (nothing else is touched).
 */
export async function branchUpdatePolicy(ctx: RequestContext, input: BranchUpdatePolicyRequest): Promise<BranchUpdatePolicyResponse> {
  requireRole(ctx, "branch.updatePolicy");
  return withTx(ctx, async (tx) => {
    const b = await branchRow(ctx, tx);
    const before = (await branchSettings(ctx, tx)).policy;
    const next = { ...before, ...input } as BranchPolicy;
    if (next.defaultDepositType === "percent" && next.defaultDepositValue > 100)
      throw new AppError("VALIDATION_FAILED", { fields: { defaultDepositValue: "a percent deposit is 0–100" } });
    for (const [field, species] of [
      ["requiredVaccinesDog", "dog"],
      ["requiredVaccinesCat", "cat"],
    ] as const) {
      const codes = input[field];
      if (!codes?.length) continue;
      // vaccine_type is reference data (no tenant key)
      const known = await tx.select().from(vaccineType).where(inArray(vaccineType.code, codes));
      if (new Set(codes).size !== codes.length || codes.some((c) => known.find((k) => k.code === c)?.species !== species))
        throw new AppError("VALIDATION_FAILED", { fields: { [field]: `codes must be ${species} vaccine types` } });
    }
    // branch_policy is keyed by the org-checked branch
    await tx
      .update(branchPolicy)
      .set({ ...input, updatedAt: ctx.now })
      .where(eq(branchPolicy.branchId, b.id));
    const after = (await branchSettings(ctx, tx)).policy;
    await writeAudit(tx, ctx, { action: "policy.update", entityType: "branch", entityId: b.id, before, after });
    return after;
  });
}
