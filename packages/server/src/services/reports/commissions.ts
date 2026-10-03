import type { CommissionReport } from "@app/contracts/dto/commission-report";
import type { ReportsCommissionsRequest, ReportsCommissionsResponse } from "@app/contracts/endpoints/reports.commissions";
import { bill, billLine, branch, commissionEntry, commissionRule, staffUser } from "@app/db/schema";
import { formatTHB } from "@app/domain/format/thai";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type Row = CommissionReport["rows"][number];

type Entry = typeof commissionEntry.$inferSelect;
type EntryItem = Row["entries"][number];

/** Q-0077: the earned (+1) / reversed (−1) events of these entries inside [start, end), with receipt, service and rule. */
export async function entryEvents(
  ctx: RequestContext,
  tx: Executor,
  entries: Entry[],
  start: Date,
  end: Date,
): Promise<Map<string, EntryItem[]>> {
  const db = tenantDb(ctx, tx);
  const ids = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x !== null))];
  const bills = entries.length
    ? ((await db.select(bill, inArray(bill.id, ids(entries.map((e) => e.billId))))) as (typeof bill.$inferSelect)[])
    : [];
  const lines = entries.length
    ? ((await db.select(billLine, inArray(billLine.id, ids(entries.map((e) => e.billLineId))))) as (typeof billLine.$inferSelect)[])
    : [];
  const ruleIds = ids(entries.map((e) => e.ruleId));
  const rules = ruleIds.length
    ? ((await db.select(commissionRule, inArray(commissionRule.id, ruleIds))) as (typeof commissionRule.$inferSelect)[])
    : [];
  const within = (at: Date | null): at is Date => at !== null && at >= start && at < end;
  const out = new Map<string, EntryItem[]>();
  for (const e of entries) {
    const rule = rules.find((r) => r.id === e.ruleId);
    const base = {
      id: e.id,
      receiptNo: bills.find((b) => b.id === e.billId)?.receiptNo ?? null,
      serviceName: lines.find((l) => l.id === e.billLineId)?.description ?? "",
      baseSatang: e.baseSatang,
      ruleLabel: rule ? (rule.type === "percent" ? `${rule.value / 100}%` : formatTHB({ satang: rule.value })) : null,
      amountSatang: e.amountSatang,
    };
    const events: EntryItem[] = [];
    if (within(e.earnedAt)) events.push({ ...base, at: e.earnedAt.toISOString(), sign: 1 });
    if (e.status === "reversed" && within(e.reversedAt)) events.push({ ...base, at: e.reversedAt.toISOString(), sign: -1 });
    out.set(e.id, events);
  }
  return out;
}

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

  const events = await entryEvents(ctx, getDb(), entries, start, end);
  const byStaff = new Map<string, Omit<Row, "staffName">>();
  for (const e of [...entries].sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id))) {
    const sign = (within(e.earnedAt) ? 1 : 0) - (e.status === "reversed" && within(e.reversedAt) ? 1 : 0);
    const row = byStaff.get(e.staffUserId) ?? { staffUserId: e.staffUserId, jobs: 0, baseSatang: 0, amountSatang: 0, entries: [] };
    row.jobs += sign;
    row.baseSatang += sign * e.baseSatang;
    row.amountSatang += sign * e.amountSatang;
    row.entries.push(...(events.get(e.id) ?? []));
    byStaff.set(e.staffUserId, row);
  }
  const staff = (await db.select(staffUser, inArray(staffUser.id, [...byStaff.keys()]))) as (typeof staffUser.$inferSelect)[];
  const names = new Map(staff.map((s) => [s.id, s.displayName]));
  const rows = [...byStaff.values()]
    .map(({ staffUserId, ...rest }) => ({ staffUserId, staffName: names.get(staffUserId) ?? "", ...rest }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName, "th") || a.staffUserId.localeCompare(b.staffUserId));
  return { from: input.from, to: input.to, rows };
}
