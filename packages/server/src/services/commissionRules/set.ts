import type { CommissionRulesSetRequest, CommissionRulesSetResponse } from "@app/contracts/endpoints/commissionRules.set";
import { branch, commissionRule, service, staffUser } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchCommissionRules } from "./list.ts";

const keyOf = (r: { serviceId?: string | null; staffUserId?: string | null }) => `${r.serviceId ?? "*"}|${r.staffUserId ?? "*"}`;

/**
 * Replaces the branch's whole rule set. Rows are matched by (serviceId, staffUserId) so a kept rule keeps its id and
 * existing commission_entry.rule_id links; entries are never recalculated.
 */
export async function commissionRulesSet(ctx: RequestContext, input: CommissionRulesSetRequest): Promise<CommissionRulesSetResponse> {
  requireRole(ctx, "commissionRules.set");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");

    const serviceIds = [...new Set(input.rules.flatMap((r) => (r.serviceId ? [r.serviceId] : [])))];
    const staffIds = [...new Set(input.rules.flatMap((r) => (r.staffUserId ? [r.staffUserId] : [])))];
    if (serviceIds.length) {
      const found = await db.select(service, and(eq(service.branchId, scopedBranch.id), inArray(service.id, serviceIds)));
      if (found.length !== serviceIds.length) throw new AppError("NOT_FOUND");
    }
    if (staffIds.length) {
      const found = await db.select(staffUser, inArray(staffUser.id, staffIds));
      if (found.length !== staffIds.length) throw new AppError("NOT_FOUND");
    }

    const before = await branchCommissionRules(ctx, tx, scopedBranch.id);
    const existingByKey = new Map(before.map((r) => [keyOf(r), r]));
    const wanted = new Set(input.rules.map(keyOf));
    const removed = before.filter((r) => !wanted.has(keyOf(r))).map((r) => r.id);
    if (removed.length) {
      // tenantDb has no delete; the organization filter is applied explicitly
      await tx
        .delete(commissionRule)
        .where(
          and(
            eq(commissionRule.organizationId, scopedBranch.organizationId),
            eq(commissionRule.branchId, scopedBranch.id),
            inArray(commissionRule.id, removed),
          ),
        );
    }
    for (const r of input.rules) {
      const current = existingByKey.get(keyOf(r));
      if (current) {
        if (current.type !== r.type || current.value !== r.value)
          await db.update(commissionRule, { type: r.type, value: r.value, updatedAt: ctx.now }, eq(commissionRule.id, current.id));
      } else {
        await db.insert(commissionRule, {
          branchId: scopedBranch.id,
          serviceId: r.serviceId ?? null,
          staffUserId: r.staffUserId ?? null,
          type: r.type,
          value: r.value,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        });
      }
    }

    const after = await branchCommissionRules(ctx, tx, scopedBranch.id);
    await writeAudit(tx, ctx, {
      action: "commission_rule.update",
      entityType: "branch",
      entityId: scopedBranch.id,
      before: { rules: before },
      after: { rules: after },
    });
    return after;
  });
}
