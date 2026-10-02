import type { StaffMeCommissionsRequest, StaffMeCommissionsResponse } from "@app/contracts/endpoints/staffMe.commissions";
import { branch, commissionEntry, staffUser } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** The current staff user's commissions in this branch for the local days from..to (Q-0030: earned +, reversed −). */
export async function staffMeCommissions(ctx: RequestContext, input: StaffMeCommissionsRequest): Promise<StaffMeCommissionsResponse> {
  requireRole(ctx, "staffMe.commissions");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = tenantDb(ctx, getDb());
  const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!scopedBranch) throw new AppError("NOT_FOUND");

  const start = new Date(localDayBounds({ date: input.from, timezone: scopedBranch.timezone }).start);
  const end = new Date(localDayBounds({ date: input.to, timezone: scopedBranch.timezone }).end);
  const inRange = (col: typeof commissionEntry.earnedAt | typeof commissionEntry.reversedAt) => and(gte(col, start), lt(col, end));
  const entries = (await db.select(
    commissionEntry,
    and(
      eq(commissionEntry.branchId, scopedBranch.id),
      eq(commissionEntry.staffUserId, ctx.actor.id),
      or(inRange(commissionEntry.earnedAt), and(eq(commissionEntry.status, "reversed"), inRange(commissionEntry.reversedAt))),
    ),
  )) as (typeof commissionEntry.$inferSelect)[];
  if (entries.length === 0) return { from: input.from, to: input.to, rows: [] };

  const row = { jobs: 0, baseSatang: 0, amountSatang: 0, entries: [] as string[] };
  for (const e of [...entries].sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id))) {
    const earned = e.earnedAt >= start && e.earnedAt < end;
    const reversed = e.status === "reversed" && e.reversedAt !== null && e.reversedAt >= start && e.reversedAt < end;
    const sign = (earned ? 1 : 0) - (reversed ? 1 : 0);
    row.jobs += sign;
    row.baseSatang += sign * e.baseSatang;
    row.amountSatang += sign * e.amountSatang;
    row.entries.push(e.id);
  }
  const [me] = (await db.select(staffUser, eq(staffUser.id, ctx.actor.id))) as (typeof staffUser.$inferSelect)[];
  return { from: input.from, to: input.to, rows: [{ staffUserId: ctx.actor.id, staffName: me?.displayName ?? "", ...row }] };
}
