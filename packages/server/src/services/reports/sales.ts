import type { SalesReport } from "@app/contracts/dto/sales-report";
import type { ReportsSalesRequest, ReportsSalesResponse } from "@app/contracts/endpoints/reports.sales";
import { bill, billLine, branch, payment, staffUser } from "@app/db/schema";
import { localDayBounds, toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type LineRow = typeof billLine.$inferSelect;
type Acc = { key: string | null; bills: Set<string>; grossSatang: number; discountSatang: number; netSatang: number };

/** R-13 #1: bill discount spread over lines with a positive total, floor each, remainder to the largest (first on a tie). */
function spread(lines: LineRow[], discount: number): Map<string, number> {
  const out = new Map(lines.map((l) => [l.id, 0]));
  const positive = lines.filter((l) => l.lineTotalSatang > 0);
  const total = positive.reduce((sum, l) => sum + l.lineTotalSatang, 0);
  if (total <= 0 || discount <= 0) return out;
  let given = 0;
  for (const l of positive) {
    const share = Math.floor((l.lineTotalSatang * discount) / total);
    out.set(l.id, share);
    given += share;
  }
  const largest = positive.reduce((best, l) => (l.lineTotalSatang > best.lineTotalSatang ? l : best));
  out.set(largest.id, (out.get(largest.id) ?? 0) + discount - given);
  return out;
}

/** Paid bills of the branch by local closed_at day, grouped per Q-0085 (05#ep-reports.sales). */
export async function reportsSales(ctx: RequestContext, input: ReportsSalesRequest): Promise<ReportsSalesResponse> {
  requireRole(ctx, "reports.sales");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = tenantDb(ctx, getDb());
  const [br] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  const start = new Date(localDayBounds({ date: input.from, timezone: br.timezone }).start);
  const end = new Date(localDayBounds({ date: input.to, timezone: br.timezone }).end);
  const bills = (await db.select(
    bill,
    and(eq(bill.branchId, br.id), eq(bill.status, "paid"), gte(bill.closedAt, start), lt(bill.closedAt, end)),
  )) as (typeof bill.$inferSelect)[];
  const billIds = bills.map((b) => b.id);
  const lines = billIds.length ? ((await db.select(billLine, inArray(billLine.billId, billIds))) as LineRow[]) : [];
  const payments = billIds.length
    ? ((await db.select(payment, and(inArray(payment.billId, billIds), eq(payment.status, "posted")))) as (typeof payment.$inferSelect)[])
    : [];
  const performerIds = [...new Set(lines.flatMap((l) => (l.performerId ? [l.performerId] : [])))];
  const names = new Map(
    performerIds.length
      ? ((await db.select(staffUser, inArray(staffUser.id, performerIds))) as (typeof staffUser.$inferSelect)[]).map((s) => [
          s.id,
          s.displayName,
        ])
      : [],
  );

  const rows = new Map<string, Acc>();
  const add = (key: string | null, billId: string, gross: number, discount: number) => {
    const id = key ?? "\u0000";
    const acc = rows.get(id) ?? { key, bills: new Set(), grossSatang: 0, discountSatang: 0, netSatang: 0 };
    acc.bills.add(billId);
    acc.grossSatang += gross;
    acc.discountSatang += discount;
    acc.netSatang += gross - discount;
    rows.set(id, acc);
  };
  const totals = { billCount: bills.length, grossSatang: 0, discountSatang: 0, netSatang: 0 };
  for (const b of bills) {
    const own = lines.filter((l) => l.billId === b.id);
    const gross = own.reduce((sum, l) => sum + l.quantity * l.unitPriceSatang, 0);
    const discount = own.reduce((sum, l) => sum + l.lineDiscountSatang, 0) + b.billDiscountSatang;
    totals.grossSatang += gross;
    totals.discountSatang += discount;
    totals.netSatang += gross - discount;
    if (input.groupBy === "day")
      add(toLocalDate({ instant: (b.closedAt as Date).toISOString(), timezone: br.timezone }), b.id, gross, discount);
    if (input.groupBy === "service" || input.groupBy === "groomer") {
      const shares = spread(own, b.billDiscountSatang);
      for (const l of own) {
        const key = input.groupBy === "service" ? l.description : l.performerId ? (names.get(l.performerId) ?? null) : null;
        add(key, b.id, l.quantity * l.unitPriceSatang, l.lineDiscountSatang + (shares.get(l.id) ?? 0));
      }
    }
  }
  // Q-0085: method rows = posted payments; a discount cannot be tied to a payment method, so gross/discount stay 0
  if (input.groupBy === "method")
    for (const p of payments) {
      add(p.method, p.billId as string, 0, 0);
      const acc = rows.get(p.method);
      if (acc) acc.netSatang += p.amountSatang;
    }

  const byMethod = new Map<string, number>();
  for (const p of payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountSatang);
  const out: SalesReport["rows"] = [...rows.values()]
    .map((r) => ({
      key: r.key,
      billCount: r.bills.size,
      grossSatang: r.grossSatang,
      discountSatang: r.discountSatang,
      netSatang: r.netSatang,
    }))
    .sort((a, b) => (a.key === null ? 1 : b.key === null ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    from: input.from,
    to: input.to,
    rows: out,
    totals,
    payments: [...byMethod].map(([method, amountSatang]) => ({
      method: method as SalesReport["payments"][number]["method"],
      amountSatang,
    })),
  };
}
