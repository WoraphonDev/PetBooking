import type { BranchSetPromptpayRequest, BranchSetPromptpayResponse } from "@app/contracts/endpoints/branch.setPromptpay";
import { auditLog, branch, staffUser } from "@app/db/schema";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { and, desc, eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { verifyPassword } from "../../auth/password.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchRow, branchSettings } from "./get.ts";

type Staff = typeof staffUser.$inferSelect;

/**
 * 05#ep-branch.setPromptpay: the owner re-enters their password (INVALID_CREDENTIALS), the id must make an R-30 payload
 * for its type (INVALID_PROMPTPAY_ID; stored as digits only, R-30 step 3), audit promptpay.update with the masked id (01
 * §8: no full account numbers), owner.promptpay_changed to every active owner (dedupe promptpay_changed:{auditId}).
 */
export async function branchSetPromptpay(ctx: RequestContext, input: BranchSetPromptpayRequest): Promise<BranchSetPromptpayResponse> {
  requireRole(ctx, "branch.setPromptpay");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [me] = (await db.select(staffUser, eq(staffUser.id, ctx.actor.id as string))) as Staff[];
    if (!me?.passwordHash || !(await verifyPassword(me.passwordHash, input.password))) throw new AppError("INVALID_CREDENTIALS");
    if ("error" in promptPayPayload({ type: input.type, id: input.id })) throw new AppError("INVALID_PROMPTPAY_ID");

    const row = await branchRow(ctx, tx);
    const before = (await branchSettings(ctx, tx)).promptpay;
    await db.update(
      branch,
      { promptpayType: input.type, promptpayId: input.id.replace(/\D/g, ""), promptpayAccountName: input.accountName, updatedAt: ctx.now },
      eq(branch.id, row.id),
    );
    const settings = await branchSettings(ctx, tx);
    await writeAudit(tx, ctx, { action: "promptpay.update", entityType: "branch", entityId: row.id, before, after: settings.promptpay });
    const [audit] = await db
      .select(auditLog, and(eq(auditLog.action, "promptpay.update"), eq(auditLog.entityId, row.id), eq(auditLog.createdAt, ctx.now)))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    const owners = (await db.select(staffUser, and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")))) as Staff[];
    for (const owner of owners)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: row.id, timezone: row.timezone },
        {
          key: "owner.promptpay_changed",
          recipient: { type: "staff", id: owner.id },
          payload: { byName: me.displayName, idMasked: settings.promptpay.idMasked ?? "" },
          dedupeKey: `promptpay_changed:${(audit as { id: string } | undefined)?.id}`,
        },
      );
    return settings;
  });
}
