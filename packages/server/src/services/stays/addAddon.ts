import type { StaysAddAddonRequest, StaysAddAddonResponse } from "@app/contracts/endpoints/stays.addAddon";
import { bill, billLine, booking, service, servicePrice, stay, stayAddon } from "@app/db/schema";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId, shopPet } from "../availability/hotel.ts";
import { refreshBill } from "../groom/addSurcharge.ts";
import { stayDetail } from "./get.ts";

/** the booking's bill for a stay change: an open bill follows the change, a paid / void one cannot (BILL_NOT_OPEN) */
export async function stayBill(tx: Tx, ctx: RequestContext, bookingId: string) {
  const db = tenantDb(ctx, tx);
  const [bk] = (await db.select(booking, eq(booking.id, bookingId)).for("update")) as (typeof booking.$inferSelect)[];
  if (!bk) throw new AppError("NOT_FOUND");
  const [b] = bk.billId ? ((await db.select(bill, eq(bill.id, bk.billId)).for("update")) as (typeof bill.$inferSelect)[]) : [];
  if (b && b.status !== "open") throw new AppError("BILL_NOT_OPEN");
  return { bk, bill: b };
}

/**
 * 05#ep-stays.addAddon: an active hotel add-on of the branch (else VALIDATION_FAILED) priced by R-02 for the pet's size tier
 * and coat on the default plan (PRICE_NOT_FOUND); quantity = nights when per-day, else the request (default 1). Allowed on
 * reserved / checked_in stays (else STATUS_NOT_ALLOWED). The booking estimate grows; an open bill that already carries this
 * stay gets a `stay_addon` line (as bills.open builds it) and new totals.
 */
export async function staysAddAddon(ctx: RequestContext, input: StaysAddAddonRequest & { stayId: string }): Promise<StaysAddAddonResponse> {
  requireRole(ctx, "stays.addAddon");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId))) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    if (s.status !== "reserved" && s.status !== "checked_in") throw new AppError("STATUS_NOT_ALLOWED", { status: s.status });
    const [svc] = (await db.select(service, eq(service.id, input.serviceId))) as (typeof service.$inferSelect)[];
    if (!svc || svc.branchId !== s.branchId) throw new AppError("NOT_FOUND");
    if (svc.scope !== "hotel" || !svc.isAddon || svc.status !== "active")
      throw new AppError("VALIDATION_FAILED", { fields: { serviceId: "select an active hotel add-on" } });
    const subject = await shopPet(ctx, tx, s.branchId, s.petId);
    const planId = await defaultPlanId(ctx, tx, s.branchId);
    const prices = planId
      ? ((await db.select(
          servicePrice,
          and(eq(servicePrice.ratePlanId, planId), eq(servicePrice.serviceId, svc.id)),
        )) as (typeof servicePrice.$inferSelect)[])
      : [];
    const price = lookupServicePrice({
      serviceId: svc.id,
      sizeTierId: subject.tierId,
      coatGroup: coatGroupOf({ coatType: subject.row.coatType }),
      prices,
    });
    if (!price) throw new AppError("PRICE_NOT_FOUND");
    const quantity = svc.addonPerDay ? s.nights : (input.quantity ?? 1);
    const total = price.priceSatang * quantity;

    const { bk, bill: b } = await stayBill(tx, ctx, s.bookingId);
    const [row] = (await db.insert(stayAddon, {
      stayId: s.id,
      serviceId: svc.id,
      nameSnapshot: svc.nameTh,
      unitPriceSatang: price.priceSatang,
      quantity,
      totalSatang: total,
      addedByType: "staff",
      createdAt: ctx.now,
    })) as (typeof stayAddon.$inferSelect)[];
    if (!row) throw new Error("stays.addAddon: no inserted row");
    await db.update(booking, { estimatedTotalSatang: bk.estimatedTotalSatang + total, updatedAt: ctx.now }, eq(booking.id, bk.id));
    if (b) {
      const [night] = await db.select(billLine, and(eq(billLine.billId, b.id), eq(billLine.refType, "stay"), eq(billLine.refId, s.id)));
      if (night) {
        await db.insert(billLine, {
          billId: b.id,
          refType: "stay_addon",
          refId: row.id,
          petId: s.petId,
          lineType: "stay_addon",
          description: row.nameSnapshot,
          quantity,
          unitPriceSatang: price.priceSatang,
          lineTotalSatang: total,
        });
        await refreshBill(tx, ctx, b);
      }
    }
  });
  return stayDetail(ctx, getDb(), input.stayId);
}
