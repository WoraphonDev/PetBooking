import type { SlipItem } from "@app/contracts/dto/slip-item";
import type { SlipsListRequest, SlipsListResponse } from "@app/contracts/endpoints/slips.list";
import { bill, booking, customer, ownerProfile, paymentSlip } from "@app/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";

type SlipRow = typeof paymentSlip.$inferSelect;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/** SlipItem for slips of this org: booking no / hold, the customer's first name (via booking or bill), signed image URL. */
export async function slipItems(ctx: RequestContext, db: Executor, slips: SlipRow[]): Promise<SlipItem[]> {
  if (slips.length === 0) return [];
  const repo = tenantDb(ctx, db);
  const bookingIds = unique(slips.flatMap((s) => (s.bookingId ? [s.bookingId] : [])));
  const billIds = unique(slips.flatMap((s) => (s.billId ? [s.billId] : [])));
  const bookings = bookingIds.length
    ? ((await repo.select(booking, inArray(booking.id, bookingIds))) as (typeof booking.$inferSelect)[])
    : [];
  const bills = billIds.length ? ((await repo.select(bill, inArray(bill.id, billIds))) as (typeof bill.$inferSelect)[]) : [];
  const customerIds = unique([...bookings.map((b) => b.customerId), ...bills.flatMap((b) => (b.customerId ? [b.customerId] : []))]);
  const customers = customerIds.length
    ? ((await repo.select(customer, inArray(customer.id, customerIds))) as (typeof customer.$inferSelect)[])
    : [];
  // owner_profile is shared across shops; reached through the tenant-checked customers
  const owners = customers.length
    ? await db
        .select({ id: ownerProfile.id, firstName: ownerProfile.firstName })
        .from(ownerProfile)
        .where(
          inArray(
            ownerProfile.id,
            customers.map((c) => c.ownerProfileId),
          ),
        )
    : [];
  const nameOf = (customerId: string | null | undefined) =>
    owners.find((o) => o.id === customers.find((c) => c.id === customerId)?.ownerProfileId)?.firstName ?? "";

  const items: SlipItem[] = [];
  for (const s of slips) {
    const bk = bookings.find((b) => b.id === s.bookingId);
    const bl = bills.find((b) => b.id === s.billId);
    items.push({
      id: s.id,
      bookingId: s.bookingId,
      bookingNo: bk?.bookingNo ?? null,
      billId: s.billId,
      customerName: nameOf(bk?.customerId ?? bl?.customerId),
      // a file that is gone (deleted) shows no image rather than failing the list
      imageUrl: await signedUrl(db, ctx, s.fileId).catch(() => null),
      amountExpectedSatang: s.amountExpectedSatang,
      transRef: s.transRef,
      isDuplicate: s.duplicateOfSlipId !== null,
      duplicateOfSlipId: s.duplicateOfSlipId,
      status: s.status,
      uploadedAt: s.createdAt.toISOString(),
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
      rejectReason: s.rejectReason,
      holdExpiresAt: bk?.holdExpiresAt?.toISOString() ?? null,
    });
  }
  return items;
}

/** 05#ep-slips.list: slips of the session branch with one status (default submitted), oldest first (review queue). */
export async function slipsList(ctx: RequestContext, input: SlipsListRequest): Promise<SlipsListResponse> {
  requireRole(ctx, "slips.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const rows = (await tenantDb(ctx, db)
    .select(paymentSlip, and(eq(paymentSlip.branchId, ctx.branchId), eq(paymentSlip.status, input.status)))
    .orderBy(asc(paymentSlip.createdAt), asc(paymentSlip.id))) as SlipRow[];
  return slipItems(ctx, db, rows);
}
