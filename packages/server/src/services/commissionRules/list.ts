import type { CommissionRuleItem } from "@app/contracts/dto/commission-rule-item";
import type { CommissionRulesListRequest, CommissionRulesListResponse } from "@app/contracts/endpoints/commissionRules.list";
import { branch, commissionRule } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export function commissionRuleItem(row: typeof commissionRule.$inferSelect): CommissionRuleItem {
  return { id: row.id, serviceId: row.serviceId, staffUserId: row.staffUserId, type: row.type, value: row.value };
}

/** The branch's rules, most specific first (R-13 lookup order): service+staff, service, staff, catch-all. */
export async function branchCommissionRules(ctx: RequestContext, db: Executor, branchId: string): Promise<CommissionRuleItem[]> {
  const rows = (await tenantDb(ctx, db)
    .select(commissionRule, eq(commissionRule.branchId, branchId))
    .orderBy(asc(commissionRule.createdAt), asc(commissionRule.id))) as (typeof commissionRule.$inferSelect)[];
  const rank = (r: typeof commissionRule.$inferSelect) => (r.serviceId ? 0 : 2) + (r.staffUserId ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b)).map(commissionRuleItem);
}

export async function commissionRulesList(ctx: RequestContext, _input: CommissionRulesListRequest): Promise<CommissionRulesListResponse> {
  requireRole(ctx, "commissionRules.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [scopedBranch] = (await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  return branchCommissionRules(ctx, db, scopedBranch.id);
}
