import type { BillDetail } from "@app/contracts/dto/bill-detail";
import type { BillsOpenRequest, BillsOpenResponse } from "@app/contracts/endpoints/bills.open";
import {
  appointmentSurcharge,
  bill,
  billLine,
  booking,
  customer,
  customerPackage,
  groomAppointment,
  groomAppointmentItem,
  packageRedemption,
  packageTemplate,
  payment,
  pet,
  staffUser,
} from "@app/db/schema";
import { computeBillTotals } from "@app/domain/billing/totals";
import { canRedeemPackage } from "@app/domain/package/package";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customerListItems } from "../customers/list.ts";
import { customersPackages } from "../customers/packages.ts";

type BillRow = typeof bill.$inferSelect;
type BookingRow = typeof booking.$inferSelect;
type PackageRow = typeof customerPackage.$inferSelect;
type NewLine = Omit<typeof billLine.$inferInsert, "organizationId" | "billId"> & { redeem?: { pkg: PackageRow; petId: string } };

const unique = <T>(xs: T[]) => [...new Set(xs)];
const invalid = (fields: Record<string, string>) => new AppError("VALIDATION_FAILED", { fields });

/** Deposits verified on these bookings that no deposit payment has used yet (05#dto-BillDetail depositAvailableSatang). */
async function unappliedDeposits(ctx: RequestContext, tx: Executor, bookings: BookingRow[]) {
  const verified = bookings.filter((b) => b.depositStatus === "verified" && b.depositVerifiedSatang > 0);
  if (verified.length === 0) return [];
  const applied = (await tenantDb(ctx, tx).select(
    payment,
    and(
      inArray(
        payment.bookingId,
        verified.map((b) => b.id),
      ),
      eq(payment.method, "deposit"),
      eq(payment.status, "posted"),
    ),
  )) as (typeof payment.$inferSelect)[];
  return verified.filter((b) => !applied.some((p) => p.bookingId === b.id));
}

/** 05#dto-BillDetail of a tenant-checked bill (shared by the bills.* endpoints). */
export async function billDetail(ctx: RequestContext, tx: Executor, b: BillRow): Promise<BillDetail> {
  const db = tenantDb(ctx, tx);
  const bookings = (await db.select(booking, eq(booking.billId, b.id)).orderBy(asc(booking.createdAt), asc(booking.id))) as BookingRow[];
  const lines = (await db
    .select(billLine, eq(billLine.billId, b.id))
    .orderBy(asc(billLine.sortOrder), asc(billLine.createdAt), asc(billLine.id))) as (typeof billLine.$inferSelect)[];
  const payments = (await db
    .select(payment, eq(payment.billId, b.id))
    .orderBy(asc(payment.receivedAt), asc(payment.id))) as (typeof payment.$inferSelect)[];
  const [opener] = (await db.select(staffUser, eq(staffUser.id, b.openedBy))) as (typeof staffUser.$inferSelect)[];
  const [cust] = b.customerId ? ((await db.select(customer, eq(customer.id, b.customerId))) as (typeof customer.$inferSelect)[]) : [];
  // pet is a shared table; ids come from the tenant-checked bill lines
  const petIds = unique(lines.flatMap((l) => (l.petId ? [l.petId] : [])));
  const petName = new Map(
    (petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const [item] = cust ? await customerListItems(tx, [cust]) : [];
  const packages = cust ? (await customersPackages(ctx, { customerId: cust.id })).filter((p) => p.status === "active") : [];
  const deposits = await unappliedDeposits(ctx, tx, bookings);
  return {
    id: b.id,
    receiptNo: b.receiptNo,
    status: b.status,
    customer: item ?? null,
    bookingIds: bookings.map((bk) => bk.id),
    subtotalSatang: b.subtotalSatang,
    billDiscountSatang: b.billDiscountSatang,
    billDiscountReason: b.billDiscountReason,
    totalSatang: b.totalSatang,
    paidSatang: b.paidSatang,
    dueSatang: b.totalSatang - b.paidSatang,
    changeSatang: b.changeSatang,
    note: b.note,
    openedByName: opener?.displayName ?? "",
    openedAt: b.openedAt.toISOString(),
    closedAt: b.closedAt?.toISOString() ?? null,
    voidedAt: b.voidedAt?.toISOString() ?? null,
    voidReason: b.voidReason,
    lines: lines.map((l) => ({
      id: l.id,
      lineType: l.lineType,
      description: l.description,
      petName: l.petId ? (petName.get(l.petId) ?? null) : null,
      quantity: l.quantity,
      unitPriceSatang: l.unitPriceSatang,
      lineDiscountSatang: l.lineDiscountSatang,
      lineDiscountReason: l.lineDiscountReason,
      lineTotalSatang: l.lineTotalSatang,
      performerId: l.performerId,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      method: p.method,
      amountSatang: p.amountSatang,
      tenderedSatang: p.tenderedSatang,
      reference: p.reference,
      status: p.status,
      receivedAt: p.receivedAt.toISOString(),
    })),
    customerCreditSatang: cust?.creditBalanceSatang ?? 0,
    availablePackages: packages,
    depositAvailableSatang: deposits.reduce((sum, bk) => sum + bk.depositVerifiedSatang, 0),
  };
}

/** Grooming lines of the bookings (05#ep-bills.open; stay/daycare lines belong to T-0270). */
async function groomLines(ctx: RequestContext, tx: Tx, bookings: BookingRow[]): Promise<NewLine[]> {
  const db = tenantDb(ctx, tx);
  const appointments = (await db
    .select(
      groomAppointment,
      and(
        inArray(
          groomAppointment.bookingId,
          bookings.map((b) => b.id),
        ),
        notInArray(groomAppointment.status, ["cancelled", "no_show"]),
      ),
    )
    .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as (typeof groomAppointment.$inferSelect)[];
  if (appointments.length === 0) return [];
  const ids = appointments.map((a) => a.id);
  const items = (await db
    .select(groomAppointmentItem, inArray(groomAppointmentItem.appointmentId, ids))
    .orderBy(
      asc(groomAppointmentItem.isAddon),
      asc(groomAppointmentItem.createdAt),
      asc(groomAppointmentItem.id),
    )) as (typeof groomAppointmentItem.$inferSelect)[];
  const surcharges = (await db
    .select(appointmentSurcharge, inArray(appointmentSurcharge.appointmentId, ids))
    .orderBy(asc(appointmentSurcharge.createdAt), asc(appointmentSurcharge.id))) as (typeof appointmentSurcharge.$inferSelect)[];
  const pkgIds = unique(items.flatMap((i) => (i.customerPackageId ? [i.customerPackageId] : [])));
  const packages = pkgIds.length
    ? ((await db.select(customerPackage, inArray(customerPackage.id, pkgIds)).for("update")) as PackageRow[])
    : [];
  const templates = packages.length
    ? ((await db.select(
        packageTemplate,
        inArray(packageTemplate.id, unique(packages.map((p) => p.templateId))),
      )) as (typeof packageTemplate.$inferSelect)[])
    : [];
  // sessions taken by earlier lines of this same bill count against later ones
  const used = new Map(packages.map((p) => [p.id, p.sessionsUsed]));
  const customerOf = new Map(bookings.map((b) => [b.id, b.customerId]));

  const lines: NewLine[] = [];
  for (const a of appointments) {
    for (const i of items.filter((x) => x.appointmentId === a.id)) {
      const pkg = packages.find((p) => p.id === i.customerPackageId);
      const tpl = pkg && templates.find((t) => t.id === pkg.templateId);
      const redeemable =
        pkg &&
        tpl &&
        pkg.customerId === customerOf.get(a.bookingId) &&
        canRedeemPackage({
          now: ctx.now.toISOString(),
          package: {
            status: pkg.status,
            sessionsUsed: used.get(pkg.id) ?? pkg.sessionsUsed,
            sessionsTotal: pkg.sessionsTotal,
            expiresAt: pkg.expiresAt.toISOString(),
            serviceId: tpl.serviceId,
            sizeTierId: tpl.sizeTierId,
            shareScope: tpl.shareScope,
            petId: pkg.petId,
          },
          appointment: { serviceId: i.serviceId, sizeTierId: a.sizeTierId, petId: a.petId },
        }).ok;
      const ref = { refType: "groom_appointment_item", refId: i.id, petId: a.petId, performerId: a.groomerId };
      if (redeemable && pkg) {
        used.set(pkg.id, (used.get(pkg.id) ?? pkg.sessionsUsed) + 1);
        lines.push({
          ...ref,
          lineType: "package_redemption",
          description: i.nameSnapshot,
          unitPriceSatang: 0,
          lineTotalSatang: 0,
          redeem: { pkg, petId: a.petId },
        });
      } else {
        // Q-0049: a package that can no longer be used is billed at the booked price
        lines.push({
          ...ref,
          lineType: i.isAddon ? "groom_addon" : "groom_service",
          description: i.nameSnapshot,
          unitPriceSatang: i.priceSatang,
          lineTotalSatang: i.priceSatang,
        });
      }
    }
    for (const s of surcharges.filter((x) => x.appointmentId === a.id))
      lines.push({
        refType: "appointment_surcharge",
        refId: s.id,
        petId: a.petId,
        performerId: a.groomerId,
        lineType: "surcharge",
        description: s.name,
        unitPriceSatang: s.amountSatang,
        lineTotalSatang: s.amountSatang,
      });
  }
  return lines;
}

/** Opens a bill (R-15) for confirmed bookings of one customer, a customer, or a walk-in sale; idempotent per booking. */
export async function billsOpen(ctx: RequestContext, input: BillsOpenRequest): Promise<BillsOpenResponse> {
  requireRole(ctx, "bills.open");
  const actorId = ctx.actor.id;
  if (!actorId) throw new AppError("FORBIDDEN");
  // BillDetail is read after commit: customersPackages reads outside the transaction
  const opened = await withTx(ctx, async (tx): Promise<BillRow> => {
    const db = tenantDb(ctx, tx);
    const ids = input.bookingIds ?? [];
    const bookings = ids.length
      ? ((await db
          .select(booking, inArray(booking.id, ids))
          .orderBy(asc(booking.createdAt), asc(booking.id))
          .for("update")) as BookingRow[])
      : [];
    if (bookings.length !== ids.length) throw new AppError("NOT_FOUND");
    if (input.customerId && !ids.length) {
      const [c] = await db.select(customer, eq(customer.id, input.customerId));
      if (!c) throw new AppError("NOT_FOUND");
    }

    // Q-0049: idempotency per booking
    const billIds = unique(bookings.flatMap((b) => (b.billId ? [b.billId] : [])));
    if (billIds.length) {
      const existing = (await db.select(bill, inArray(bill.id, billIds))) as BillRow[];
      if (existing.some((b) => b.status !== "open")) throw new AppError("BILL_NOT_OPEN");
      const [only] = existing;
      if (only && existing.length === 1 && bookings.every((b) => b.billId === only.id)) return only;
      throw invalid({ bookingIds: "bookings are on another open bill" });
    }
    const customers = unique(bookings.map((b) => b.customerId));
    if (customers.length > 1) throw invalid({ bookingIds: "bookings of different customers" });
    if (unique(bookings.map((b) => b.branchId)).length > 1) throw invalid({ bookingIds: "bookings of different branches" });
    if (input.customerId && customers[0] && customers[0] !== input.customerId) throw invalid({ customerId: "not the bookings' customer" });
    if (bookings.some((b) => b.status !== "confirmed")) throw invalid({ bookingIds: "only confirmed bookings can be billed" });
    const branchId = bookings[0]?.branchId ?? ctx.branchId;
    if (!branchId) throw new AppError("NOT_FOUND");

    const lines = await groomLines(ctx, tx, bookings);
    const totals = computeBillTotals({
      lines: lines.map((l) => ({ quantity: 1, unitPriceSatang: l.unitPriceSatang, lineDiscountSatang: 0 })),
      billDiscountSatang: 0,
      payments: [],
    });
    if ("error" in totals) throw new AppError("INTERNAL", { cause: totals.error });

    const [created] = (await db.insert(bill, {
      branchId,
      customerId: customers[0] ?? input.customerId ?? null,
      status: "open",
      subtotalSatang: totals.subtotalSatang,
      totalSatang: totals.totalSatang,
      openedBy: actorId,
      openedAt: ctx.now,
    })) as BillRow[];
    if (!created) throw new AppError("INTERNAL");

    for (const [index, { redeem, ...line }] of lines.entries()) {
      const [row] = (await db.insert(billLine, { ...line, billId: created.id, sortOrder: index })) as (typeof billLine.$inferSelect)[];
      if (!redeem || !row) continue;
      await db.insert(packageRedemption, {
        customerPackageId: redeem.pkg.id,
        billLineId: row.id,
        petId: redeem.petId,
        performerId: line.performerId ?? null,
        redeemedAt: ctx.now,
      });
    }
    // R-14: sessions_used once per package, exhausted when all are used
    for (const pkgId of unique(lines.flatMap((l) => (l.redeem ? [l.redeem.pkg.id] : [])))) {
      const pkg = lines.find((l) => l.redeem?.pkg.id === pkgId)?.redeem?.pkg;
      if (!pkg) continue;
      const sessionsUsed = pkg.sessionsUsed + lines.filter((l) => l.redeem?.pkg.id === pkgId).length;
      await db.update(
        customerPackage,
        { sessionsUsed, status: sessionsUsed >= pkg.sessionsTotal ? "exhausted" : pkg.status, updatedAt: ctx.now },
        eq(customerPackage.id, pkgId),
      );
    }

    // R-15 #4: verified deposits → payment `deposit` = min(deposit_verified, what is left of the total)
    let paid = 0;
    for (const bk of await unappliedDeposits(ctx, tx, bookings)) {
      const amount = Math.min(bk.depositVerifiedSatang, totals.totalSatang - paid);
      if (amount <= 0) break;
      await db.insert(payment, {
        branchId,
        bookingId: bk.id,
        billId: created.id,
        method: "deposit",
        amountSatang: amount,
        receivedBy: actorId,
        receivedAt: ctx.now,
      });
      paid += amount;
    }
    if (bookings.length) await db.update(booking, { billId: created.id, updatedAt: ctx.now }, inArray(booking.id, ids));
    const [current] = (await db.update(bill, { paidSatang: paid }, eq(bill.id, created.id))) as BillRow[];
    return current ?? created;
  });
  return billDetail(ctx, getDb(), opened);
}
