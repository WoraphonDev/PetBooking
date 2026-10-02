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
import { defaultPlanId, scopedBranch, shopPet } from "../availability/hotel.ts";

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
  const groom = [];
  for (const item of input.groom) {
    const subject = await shopPet(ctx, db, b.id, item.petId);
    if (subject.row.ownerProfileId !== c.ownerProfileId) throw new AppError("NOT_FOUND");
    const [groomer] = await repo.select(staffUser, eq(staffUser.id, item.groomerId));
    const [station] = await repo.select(groomStation, and(eq(groomStation.id, item.stationId), eq(groomStation.branchId, b.id)));
    if (!groomer || !station) throw new AppError("NOT_FOUND");
    if (item.customerPackageId) {
      const [pack] = await repo.select(
        customerPackage,
        and(eq(customerPackage.id, item.customerPackageId), eq(customerPackage.customerId, c.id)),
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
    const fields: Record<string, string> = {};
    for (const s of services) {
      if (
        s.scope !== "grooming" ||
        s.status !== "active" ||
        (item.serviceIds.includes(s.id) && s.isAddon) ||
        (item.addonIds.includes(s.id) && !s.isAddon)
      )
        fields[`groom.${input.groom.indexOf(item)}.serviceIds`] = "select active grooming services and add-ons";
    }
    if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });
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
    groom.push({ startsAt: item.startsAt, items });
  }
  const quote = quoteBooking({ bufferMinutes: policy.bufferMinutes, groom });
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
    requiresApproval: !policy.autoConfirmGrooming || level === 1,
    policyText: policy.policyText,
    cancelSummary: `ยกเลิกก่อนเริ่มบริการอย่างน้อย ${policy.groomingFreeCancelHours} ชั่วโมง ไม่ริบมัดจำ; ยกเลิกภายหลัง ริบมัดจำ ${policy.lateCancelForfeitPercent}%`,
  };
}
