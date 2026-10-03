import type { QuotesCreateRequest, QuotesCreateResponse } from "@app/contracts/endpoints/quotes.create";
import { branchPolicy, customer, customerPackage, groomStation, service, servicePrice, sizeTier, staffUser } from "@app/db/schema";
import { computeDeposit } from "@app/domain/payment/deposit";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { quoteBooking } from "@app/domain/pricing/quote";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId, scopedBranch } from "../availability/hotel.ts";
import { customerPet, priceDaycare, priceStay } from "./create/hotel-daycare.ts";

type GroomInput = Omit<QuotesCreateRequest["groom"][number], "groomerPreference">;

/** Read-only estimate; catalog price snapshots are persisted by bookings.create, not quotes.create. */
export async function quotesCreate(ctx: RequestContext, input: QuotesCreateRequest): Promise<QuotesCreateResponse> {
  requireRole(ctx, "quotes.create");
  const db = getDb();
  const b = await scopedBranch(ctx, db);
  const repo = tenantDb(ctx, db);
  const [c] = (await repo.select(customer, eq(customer.id, input.customerId))) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id));
  if (!policy) throw new AppError("NOT_FOUND");
  const planId = await defaultPlanId(ctx, db, b.id);
  const customerId = c.id;
  const scope = { ctx, db, branchId: b.id, planId, ownerProfileId: c.ownerProfileId };

  async function priceGroom(item: GroomInput, path: string) {
    const subject = await customerPet(scope, item.petId);
    const [groomer] = await repo.select(staffUser, eq(staffUser.id, item.groomerId));
    const [station] = await repo.select(groomStation, and(eq(groomStation.id, item.stationId), eq(groomStation.branchId, b.id)));
    if (!groomer || !station) throw new AppError("NOT_FOUND");
    if (item.customerPackageId) {
      const [pack] = await repo.select(
        customerPackage,
        and(eq(customerPackage.id, item.customerPackageId), eq(customerPackage.customerId, customerId)),
      );
      if (!pack) throw new AppError("NOT_FOUND");
    }
    let tierId = subject.tierId;
    if (item.sizeTierId) {
      const [tier] = await repo.select(sizeTier, and(eq(sizeTier.id, item.sizeTierId), eq(sizeTier.branchId, b.id)));
      if (!tier) throw new AppError("NOT_FOUND");
      tierId = item.sizeTierId;
    } else if (subject.row.species !== "other" && subject.row.latestWeightGrams === null) throw new AppError("WEIGHT_REQUIRED");
    const ids = [...new Set([...item.serviceIds, ...item.addonIds])];
    const services = (await repo.select(
      service,
      and(eq(service.branchId, b.id), inArray(service.id, ids)),
    )) as (typeof service.$inferSelect)[];
    if (services.length !== ids.length) throw new AppError("NOT_FOUND");
    for (const s of services) {
      if (
        s.scope !== "grooming" ||
        s.status !== "active" ||
        (item.serviceIds.includes(s.id) && s.isAddon) ||
        (item.addonIds.includes(s.id) && !s.isAddon)
      )
        throw new AppError("VALIDATION_FAILED", { fields: { [`${path}.serviceIds`]: "select active grooming services and add-ons" } });
    }
    const prices = planId
      ? ((await repo.select(
          servicePrice,
          and(eq(servicePrice.ratePlanId, planId), inArray(servicePrice.serviceId, ids)),
        )) as (typeof servicePrice.$inferSelect)[])
      : [];
    const items = [...item.serviceIds, ...item.addonIds].map((serviceId) => {
      const price = lookupServicePrice({
        serviceId,
        sizeTierId: tierId,
        coatGroup: coatGroupOf({ coatType: subject.row.coatType }),
        prices,
      });
      if (!price) throw new AppError("PRICE_NOT_FOUND");
      return price;
    });
    return { startsAt: item.startsAt, items };
  }

  const groom = [];
  for (const [i, item] of input.groom.entries()) groom.push(await priceGroom(item, `groom.${i}`));
  // Q-0070: a stay's checkout-day bundle groom is quoted as an extra groom entry after groom[]
  for (const [i, item] of input.stays.entries())
    if (item.bundleGroom) groom.push(await priceGroom({ ...item.bundleGroom, petId: item.petId }, `stays.${i}.bundleGroom`));
  const stays = [];
  for (const [i, item] of input.stays.entries()) stays.push(await priceStay(scope, item, i));
  const daycare = [];
  for (const item of input.daycare) daycare.push(await priceDaycare(scope, item));
  const quote = quoteBooking({ bufferMinutes: policy.bufferMinutes, groom, stays, daycare });
  if ("error" in quote) throw new AppError(quote.error);
  const level = (c.reliabilityOverride ?? c.reliabilityLevel) as 1 | 2 | 3 | 4;
  const deposit = computeDeposit({
    estimatedTotalSatang: quote.estimatedTotalSatang,
    policy: { type: policy.defaultDepositType, value: policy.defaultDepositValue },
    customer: { depositExempt: c.depositExempt, reliabilityLevel: level },
  });
  return {
    ...quote,
    depositRequiredSatang: deposit.depositRequiredSatang,
    depositReason: deposit.reason,
    // R-08: any quoted module without auto-confirm, or reliability 1
    requiresApproval:
      (groom.length > 0 && !policy.autoConfirmGrooming) ||
      (stays.length > 0 && !policy.autoConfirmHotel) ||
      (daycare.length > 0 && !policy.autoConfirmDaycare) ||
      level === 1,
    policyText: policy.policyText,
    // Q-0036 wording; R-07 step 2: the strictest free-cancel window among the quoted modules
    cancelSummary: `ยกเลิกก่อนเริ่มบริการอย่างน้อย ${Math.max(
      ...[
        groom.length || (!stays.length && !daycare.length) ? policy.groomingFreeCancelHours : 0,
        stays.length ? policy.hotelFreeCancelHours : 0,
        daycare.length ? policy.daycareFreeCancelHours : 0,
      ],
    )} ชั่วโมง ไม่ริบมัดจำ; ยกเลิกภายหลัง ริบมัดจำ ${policy.lateCancelForfeitPercent}%`,
  };
}
