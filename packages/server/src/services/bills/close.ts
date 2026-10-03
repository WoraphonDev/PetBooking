import type { BillsCloseRequest, BillsCloseResponse } from "@app/contracts/endpoints/bills.close";
import {
  bill,
  billLine,
  booking,
  branch,
  commissionEntry,
  commissionRule,
  creditLedger,
  customer,
  customerPackage,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  packageTemplate,
  payment,
  stay,
} from "@app/db/schema";
import { computeBillTotals } from "@app/domain/billing/totals";
import { computeCommissions } from "@app/domain/commission/commission";
import { computeReliability } from "@app/domain/customer/reliability";
import { formatTHB } from "@app/domain/format/thai";
import { nextReceiptNo } from "@app/domain/ids/receipt-no";
import { packageTerms } from "@app/domain/package/package";
import { and, eq, gte, inArray, notInArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { billDetail } from "./open.ts";

type BillRow = typeof bill.$inferSelect;
type LineRow = typeof billLine.$inferSelect;
type BookingRow = typeof booking.$inferSelect;
const unique = <T>(xs: T[]) => [...new Set(xs)];
/** 03 sm-booking: a booking closes when every child is in an end state */
const ENDED = {
  groom: ["picked_up", "no_show", "cancelled"],
  stay: ["checked_out", "no_show", "cancelled"],
  daycare: ["checked_out", "no_show", "cancelled"],
};

/** R-13: one commission_entry per eligible line with a performer, at the bill's close time. */
async function writeCommissions(ctx: RequestContext, tx: Tx, b: BillRow, lines: LineRow[]) {
  const db = tenantDb(ctx, tx);
  const itemIds = lines.flatMap((l) => (l.refType === "groom_appointment_item" && l.refId ? [l.refId] : []));
  const items = itemIds.length
    ? ((await db.select(groomAppointmentItem, inArray(groomAppointmentItem.id, itemIds))) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  // the package behind each redemption line: a booking item's package, or the counter redemption's own ref
  const pkgOf = (l: LineRow) =>
    l.refType === "customer_package" ? l.refId : (items.find((i) => i.id === l.refId)?.customerPackageId ?? null);
  const pkgIds = unique(lines.flatMap((l) => (l.lineType === "package_redemption" && pkgOf(l) ? [pkgOf(l) as string] : [])));
  const packages = pkgIds.length
    ? ((await db.select(customerPackage, inArray(customerPackage.id, pkgIds))) as (typeof customerPackage.$inferSelect)[])
    : [];
  const templates = packages.length
    ? ((await db.select(
        packageTemplate,
        inArray(packageTemplate.id, unique(packages.map((p) => p.templateId))),
      )) as (typeof packageTemplate.$inferSelect)[])
    : [];
  const rules = (await db.select(commissionRule, eq(commissionRule.branchId, b.branchId))) as (typeof commissionRule.$inferSelect)[];
  const entries = computeCommissions({
    lines: lines.map((l) => {
      const pkg = packages.find((p) => p.id === pkgOf(l));
      const serviceId =
        items.find((i) => i.id === l.refId)?.serviceId ?? templates.find((t) => t.id === pkg?.templateId)?.serviceId ?? null;
      return {
        billLineId: l.id,
        lineType: l.lineType,
        serviceId,
        performerId: l.performerId,
        lineTotalSatang: l.lineTotalSatang,
        quantity: l.quantity,
        ...(pkg ? { packageUnitValueSatang: pkg.unitValueSatang } : {}),
      };
    }),
    billDiscountSatang: b.billDiscountSatang,
    rules: rules.map((r) => ({ id: r.id, serviceId: r.serviceId, staffUserId: r.staffUserId, type: r.type, value: r.value })),
  });
  if (entries.length)
    await db.insert(
      commissionEntry,
      entries.map((e) => ({ ...e, branchId: b.branchId, billId: b.id, earnedAt: ctx.now, createdAt: ctx.now })),
    );
}

/** R-14: each package_sale line becomes the customer's active package, valid from now. */
async function createPackages(ctx: RequestContext, tx: Tx, b: BillRow, lines: LineRow[], timezone: string) {
  const sales = lines.filter((l) => l.lineType === "package_sale" && l.refId);
  if (!sales.length) return;
  if (!b.customerId) throw new AppError("VALIDATION_FAILED", { fields: { billId: "a package sale needs a customer" } });
  const db = tenantDb(ctx, tx);
  const templates = (await db.select(
    packageTemplate,
    inArray(packageTemplate.id, unique(sales.map((l) => l.refId as string))),
  )) as (typeof packageTemplate.$inferSelect)[];
  for (const line of sales) {
    const tpl = templates.find((t) => t.id === line.refId);
    if (!tpl) throw new AppError("NOT_FOUND");
    // Q-0074: the value is what the customer paid on this line (template price snapshot − line discount)
    const terms = packageTerms({
      priceSatang: line.lineTotalSatang,
      sessionsCount: tpl.sessionsCount,
      validityDays: tpl.validityDays,
      purchasedAt: ctx.now.toISOString(),
      timezone,
    });
    await db.insert(customerPackage, {
      customerId: b.customerId,
      templateId: tpl.id,
      petId: tpl.shareScope === "single_pet" ? line.petId : null,
      sessionsTotal: tpl.sessionsCount,
      unitValueSatang: terms.unitValueSatang,
      purchasedBillId: b.id,
      purchasedAt: ctx.now,
      expiresAt: new Date(terms.expiresAt),
    });
  }
}

/** Unapplied verified deposits → credit (deposit_credit); deposit_status → applied (05#ep-bills.close). */
async function settleDeposits(ctx: RequestContext, tx: Tx, bookings: BookingRow[]) {
  const db = tenantDb(ctx, tx);
  for (const bk of bookings.filter((x) => x.depositStatus === "verified")) {
    const applied = (
      (await db.select(
        payment,
        and(eq(payment.bookingId, bk.id), eq(payment.method, "deposit"), eq(payment.status, "posted")),
      )) as (typeof payment.$inferSelect)[]
    ).reduce((sum, p) => sum + p.amountSatang, 0);
    const excess = bk.depositVerifiedSatang - applied;
    if (excess > 0) {
      const [c] = (await db.select(customer, eq(customer.id, bk.customerId)).for("update")) as (typeof customer.$inferSelect)[];
      if (!c) throw new AppError("NOT_FOUND");
      await db.insert(creditLedger, {
        customerId: c.id,
        deltaSatang: excess,
        reason: "deposit_credit",
        refType: "booking",
        refId: bk.id,
        createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
        createdAt: ctx.now,
      });
      await db.update(customer, { creditBalanceSatang: c.creditBalanceSatang + excess, updatedAt: ctx.now }, eq(customer.id, c.id));
    }
    await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "applied" });
  }
}

/** 03: confirmed bookings whose children have all ended → closed. */
async function closeBookings(ctx: RequestContext, tx: Tx, bookings: BookingRow[]) {
  const db = tenantDb(ctx, tx);
  for (const bk of bookings.filter((x) => x.status === "confirmed")) {
    const open = [
      ...(await db.select(
        groomAppointment,
        and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, ENDED.groom as never[])),
      )),
      ...(await db.select(stay, and(eq(stay.bookingId, bk.id), notInArray(stay.status, ENDED.stay as never[])))),
      ...(await db.select(daycareVisit, and(eq(daycareVisit.bookingId, bk.id), notInArray(daycareVisit.status, ENDED.daycare as never[])))),
    ];
    if (open.length === 0) await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "closed" });
  }
}

/** customer.visit_count / first/last_visit_at and the R-09 level (completed visits = children of paid bills in 12 months). */
async function updateCustomer(ctx: RequestContext, tx: Tx, customerId: string) {
  const db = tenantDb(ctx, tx);
  const [c] = (await db.select(customer, eq(customer.id, customerId)).for("update")) as (typeof customer.$inferSelect)[];
  if (!c) return;
  const since = new Date(ctx.now);
  since.setUTCMonth(since.getUTCMonth() - 12);
  const paid = (await db.select(bill, and(eq(bill.customerId, c.id), eq(bill.status, "paid"), gte(bill.closedAt, since)))) as BillRow[];
  const bookingIds = paid.length
    ? (
        (await db.select(
          booking,
          inArray(
            booking.billId,
            paid.map((x) => x.id),
          ),
        )) as BookingRow[]
      ).map((x) => x.id)
    : [];
  const completed = bookingIds.length
    ? (await db.select(groomAppointment, and(inArray(groomAppointment.bookingId, bookingIds), eq(groomAppointment.status, "picked_up"))))
        .length +
      (await db.select(stay, and(inArray(stay.bookingId, bookingIds), eq(stay.status, "checked_out")))).length +
      (await db.select(daycareVisit, and(inArray(daycareVisit.bookingId, bookingIds), eq(daycareVisit.status, "checked_out")))).length
    : 0;
  const { level } = computeReliability({
    noShowCount12m: c.noShowCount12m,
    lateCancelCount12m: c.lateCancelCount12m,
    completedVisits12m: completed,
    override: null,
  });
  await db.update(
    customer,
    {
      visitCount: c.visitCount + 1,
      firstVisitAt: c.firstVisitAt ?? ctx.now,
      lastVisitAt: ctx.now,
      reliabilityLevel: level,
      updatedAt: ctx.now,
    },
    eq(customer.id, c.id),
  );
}

/** Closes a fully paid bill: receipt number (R-16), commissions (R-13), packages (R-14), deposits, bookings, customer, receipt (05#ep-bills.close). */
export async function billsClose(ctx: RequestContext, input: BillsCloseRequest & { billId: string }): Promise<BillsCloseResponse> {
  requireRole(ctx, "bills.close");
  const closed = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const [b] = (await db.select(bill, eq(bill.id, input.billId)).for("update")) as BillRow[];
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "open") throw new AppError("BILL_NOT_OPEN");
    if (b.paidSatang !== input.expectedPaidSatang) throw new AppError("STALE_BILL");
    const lines = (await db.select(billLine, eq(billLine.billId, b.id))) as LineRow[];
    const posted = (await db.select(
      payment,
      and(eq(payment.billId, b.id), eq(payment.status, "posted")),
    )) as (typeof payment.$inferSelect)[];
    const totals = computeBillTotals({
      lines: lines.map((l) => ({ quantity: l.quantity, unitPriceSatang: l.unitPriceSatang, lineDiscountSatang: l.lineDiscountSatang })),
      billDiscountSatang: b.billDiscountSatang,
      payments: posted.map((p) => ({ method: p.method, amountSatang: p.amountSatang, status: "posted" as const })),
    });
    if ("error" in totals) throw new AppError(totals.error === "INVALID_QUANTITY" ? "VALIDATION_FAILED" : totals.error);
    if (!totals.canClose) throw new AppError("BILL_HAS_DUE");

    // R-16: lock the branch row, then take the next receipt number
    const [br] = (await db.select(branch, eq(branch.id, b.branchId)).for("update")) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");
    const receipt = nextReceiptNo({
      prefix: br.receiptPrefix,
      now: ctx.now.toISOString(),
      timezone: br.timezone,
      counter: { yearBe: br.receiptYearBe, nextSeq: br.receiptNextSeq },
    });
    await db.update(branch, { receiptYearBe: receipt.counter.yearBe, receiptNextSeq: receipt.counter.nextSeq }, eq(branch.id, br.id));
    const row = (await transition(tx, ctx, {
      table: bill,
      id: b.id,
      machine: "bill",
      to: "paid",
      extraSet: {
        receiptNo: receipt.receiptNo,
        subtotalSatang: totals.subtotalSatang,
        totalSatang: totals.totalSatang,
        paidSatang: totals.paidSatang,
        closedBy: ctx.actor.id,
        closedAt: ctx.now,
      },
    })) as BillRow;

    await writeCommissions(ctx, tx, row, lines);
    await createPackages(ctx, tx, row, lines, br.timezone);
    // Q-0074: package_redemption sessions were already counted when the line was added (bills.open / bills.addLine)
    const bookings = (await db.select(booking, eq(booking.billId, b.id))) as BookingRow[];
    await settleDeposits(ctx, tx, bookings);
    await closeBookings(ctx, tx, bookings);
    if (row.customerId) await updateCustomer(ctx, tx, row.customerId);
    await writeAudit(tx, ctx, {
      action: "bill.close",
      entityType: "bill",
      entityId: row.id,
      before: { status: "open" },
      after: { status: "paid", receiptNo: row.receiptNo, totalSatang: row.totalSatang, paidSatang: row.paidSatang },
    });
    if (row.customerId)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: br.id, timezone: br.timezone },
        {
          key: "customer.receipt",
          recipient: { type: "customer", id: row.customerId },
          payload: {
            receiptNo: row.receiptNo ?? "",
            total: formatTHB({ satang: row.totalSatang, decimals: "always" }),
            receiptUrl: new URL(`/liff/${br.bookingSlug}/receipts/${row.id}`, process.env.APP_BASE_URL).toString(),
          },
          // 07 `receipt:{billId}:{n}` — closing is the first receipt (bills.sendReceipt counts on from here)
          dedupeKey: `receipt:${row.id}:1`,
        },
      );
    return row;
  });
  return billDetail(ctx, getDb(), closed);
}
