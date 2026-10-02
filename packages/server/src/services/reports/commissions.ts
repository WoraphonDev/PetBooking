import type { CommissionReport } from "@app/contracts/dto/commission-report";
import type { ReportsCommissionsRequest, ReportsCommissionsResponse } from "@app/contracts/endpoints/reports.commissions";
import { branch, commissionEntry, staffUser } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type Row = CommissionReport["rows"][number];

/** Every staff member's commissions in this branch for the local days from..to (05#dto-CommissionReport: earned +, reversed −). */
export async function reportsCommissions(ctx: RequestContext, input: ReportsCommissionsRequest): Promise<ReportsCommissionsResponse> {
  requireRole(ctx, "reports.commissions");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = tenantDb(ctx, getDb());
  const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!scopedBranch) throw new AppError("NOT_FOUND");

  const start = new Date(localDayBounds({ date: input.from, timezone: scopedBranch.timezone }).start);
  const end = new Date(localDayBounds({ date: input.to, timezone: scopedBranch.timezone }).end);
  const within = (at: Date | null) => at !== null && at >= start && at < end;
  const entries = (await db.select(
    commissionEntry,
    and(
      eq(commissionEntry.branchId, scopedBranch.id),
      or(
        and(gte(commissionEntry.earnedAt, start), lt(commissionEntry.earnedAt, end)),
        and(eq(commissionEntry.status, "reversed"), gte(commissionEntry.reversedAt, start), lt(commissionEntry.reversedAt, end)),
      ),
    ),
  )) as (typeof commissionEntry.$inferSelect)[];
  if (entries.length === 0) return { from: input.from, to: input.to, rows: [] };

  const byStaff = new Map<string, Omit<Row, "staffName">>();
  for (const e of [...entries].sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id))) {
    const sign = (within(e.earnedAt) ? 1 : 0) - (e.status === "reversed" && within(e.reversedAt) ? 1 : 0);
    const row = byStaff.get(e.staffUserId) ?? { staffUserId: e.staffUserId, jobs: 0, baseSatang: 0, amountSatang: 0, entries: [] };
    row.jobs += sign;
    row.baseSatang += sign * e.baseSatang;
    row.amountSatang += sign * e.amountSatang;
    row.entries.push(e.id);
    byStaff.set(e.staffUserId, row);
  }
  const staff = (await db.select(staffUser, inArray(staffUser.id, [...byStaff.keys()]))) as (typeof staffUser.$inferSelect)[];
  const names = new Map(staff.map((s) => [s.id, s.displayName]));
  const rows = [...byStaff.values()]
    .map(({ staffUserId, ...rest }) => ({ staffUserId, staffName: names.get(staffUserId) ?? "", ...rest }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName, "th") || a.staffUserId.localeCompare(b.staffUserId));
  return { from: input.from, to: input.to, rows };
}
