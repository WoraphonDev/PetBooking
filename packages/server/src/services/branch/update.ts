import type { BranchUpdateRequest, BranchUpdateResponse } from "@app/contracts/endpoints/branch.update";
import { branch } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchRow, branchSettings } from "./get.ts";
export async function branchUpdate(ctx: RequestContext, input: BranchUpdateRequest): Promise<BranchUpdateResponse> {
  requireRole(ctx, "branch.update");
  return withTx(ctx, async (tx) => {
    const row = await branchRow(ctx, tx);
    const fields = { ...input };
    if (input.phone !== undefined) {
      const phone = normalizePhone({ input: input.phone });
      if (phone.error) throw new AppError(phone.error);
      fields.phone = phone.e164!;
    }
    if (input.logoFileId) await commitFile(tx, ctx, input.logoFileId, "logo");
    await tenantDb(ctx, tx).update(branch, { ...fields, updatedAt: ctx.now }, eq(branch.id, row.id));
    return branchSettings(ctx, tx);
  });
}
