import { BranchSettings } from "@app/contracts/dto/branch-settings";
import type { BranchGetRequest, BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { branch, branchHours, branchPolicy } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
export async function branchRow(ctx: RequestContext, tx: Executor) {
  if (!ctx.orgId || !ctx.branchId) throw new AppError("NOT_FOUND");
  const [row] = (await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}
export async function branchSettings(ctx: RequestContext, tx: Executor): Promise<BranchSettings> {
  const row = await branchRow(ctx, tx);
  // Child tables have no tenant key; both are reached through the org-checked branch.
  const hours = await tx.select().from(branchHours).where(eq(branchHours.branchId, row.id)).orderBy(asc(branchHours.weekday));
  const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, row.id));
  if (!policy) throw new Error("Branch policy missing");
  return BranchSettings.parse({
    ...row,
    logoUrl: row.logoFileId ? await signedUrl(tx, ctx, row.logoFileId) : null,
    promptpay: {
      type: row.promptpayType,
      idMasked: row.promptpayId === null ? null : "*".repeat(Math.max(0, row.promptpayId.length - 3)) + row.promptpayId.slice(-3),
      accountName: row.promptpayAccountName,
    },
    modules: { grooming: row.moduleGrooming, hotel: row.moduleHotel, daycare: row.moduleDaycare },
    hours: hours.map((h) => ({ ...h, opensAt: h.opensAt?.slice(0, 5) ?? null, closesAt: h.closesAt?.slice(0, 5) ?? null })),
    policy: { ...policy, dailySummaryTime: policy.dailySummaryTime.slice(0, 5) },
  });
}
export async function branchGet(ctx: RequestContext, _input: BranchGetRequest): Promise<BranchGetResponse> {
  requireRole(ctx, "branch.get");
  return branchSettings(ctx, getDb());
}
