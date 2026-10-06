import type { LiffQuoteRequest, LiffQuoteResponse } from "@app/contracts/endpoints/liff.quote";
import { branchPolicy, groomStation, service, servicePrice, sizeTier, staffUser } from "@app/db/schema";
import { computeDeposit } from "@app/domain/payment/deposit";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { quoteBooking } from "@app/domain/pricing/quote";
import { and, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId, scopedBranch, shopPet } from "../availability/hotel.ts";
import { liffCustomer, requireMyPet } from "./pets.ts";

type GroomItem = LiffQuoteRequest["groom"][number];

/**
 * 05#ep-liff.quote (grooming only for T-0176): read-only estimate for the signed-in customer, the same way quotes.create
 * prices it — R-02 per service on the default plan, R-03 totals (end / blocked-until with the shop buffer), R-06 deposit
 * for this customer, R-08 requiresApproval, policy text and cancel summary. Customer rules as liff.groomSlots (Q-1046):
 * grooming module on, own active pet, active online_bookable services, size choice only without a weight; the slot's
 * groomer / station must be this shop's (availability itself is re-checked by liff.createBooking) (Q-1047).
 */
export async function liffQuote(ctx: RequestContext, input: LiffQuoteRequest): Promise<LiffQuoteResponse> {
  const db = getDb();
  const repo = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  const c = await liffCustomer(ctx, db);
  if (c.blacklisted) throw new AppError("CUSTOMER_BLACKLISTED");
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id));
  if (!policy) throw new AppError("NOT_FOUND");
  const planId = await defaultPlanId(ctx, db, b.id);

  async function priceGroom(item: GroomItem, path: string) {
    await requireMyPet(ctx, db, item.petId);
    const subject = await shopPet(ctx, db, b.id, item.petId);
    const [groomer] = await repo.select(
      staffUser,
      and(eq(staffUser.id, item.groomerId), eq(staffUser.isGroomer, true), eq(staffUser.status, "active")),
    );
    const [station] = await repo.select(groomStation, and(eq(groomStation.id, item.stationId), eq(groomStation.branchId, b.id)));
    if (!groomer || !station) throw new AppError("NOT_FOUND");
    let tierId = subject.tierId;
    if (subject.row.species !== "other" && subject.row.latestWeightGrams === null) {
      if (!item.sizeTierId) throw new AppError("WEIGHT_REQUIRED");
      const [tier] = await repo.select(sizeTier, and(eq(sizeTier.id, item.sizeTierId), eq(sizeTier.branchId, b.id)));
      if (!tier) throw new AppError("NOT_FOUND");
      tierId = item.sizeTierId;
    }
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
        !s.onlineBookable ||
        (item.serviceIds.includes(s.id) && s.isAddon) ||
        (item.addonIds.includes(s.id) && !s.isAddon)
      )
        throw new AppError("VALIDATION_FAILED", {
          fields: { [`${path}.serviceIds`]: "select online-bookable grooming services and add-ons" },
        });
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
  const quote = quoteBooking({ bufferMinutes: policy.bufferMinutes, groom, stays: [], daycare: [] });
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
    // R-08: grooming without auto-confirm, or reliability 1
    requiresApproval: !policy.autoConfirmGrooming || level === 1,
    policyText: policy.policyText,
    // Q-0036 wording (as quotes.create): the grooming free-cancel window
    cancelSummary: `ยกเลิกก่อนเริ่มบริการอย่างน้อย ${policy.groomingFreeCancelHours} ชั่วโมง ไม่ริบมัดจำ; ยกเลิกภายหลัง ริบมัดจำ ${policy.lateCancelForfeitPercent}%`,
  };
}
