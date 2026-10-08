import type { LiffGroomSlotsRequest, LiffGroomSlotsResponse } from "@app/contracts/endpoints/liff.groomSlots";
import { service, servicePrice, sizeTier } from "@app/db/schema";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { and, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { groomDaySlots } from "../availability/groom-slots-core.ts";
import { defaultPlanId, scopedBranch, shopPet } from "../availability/hotel.ts";
import { requireMyPet } from "./pets.ts";

/**
 * 05#ep-liff.groomSlots: R-04 slots on the `online` channel (lead time + horizon) for one of the customer's own pets, with
 * R-02/R-03 price and duration. Same day inputs as availability.groomSlots (staff), plus the customer rules (Q-1046):
 * grooming module off → MODULE_DISABLED; another customer's pet → NOT_FOUND; blacklisted customer (R-12 step 1) →
 * CUSTOMER_BLACKLISTED; services must be active, online_bookable grooming services (mains not add-ons, add-ons add-ons);
 * the customer's size choice only counts while the pet has no weight (else R-01 from the weight), none → WEIGHT_REQUIRED.
 * groomerName = staff_user.display_name. Rate limit 30/min/user comes from the route wrapper (ruleFor liff.groomSlots).
 */
export async function liffGroomSlots(ctx: RequestContext, input: LiffGroomSlotsRequest): Promise<LiffGroomSlotsResponse> {
  const db = getDb();
  const tdb = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  await requireMyPet(ctx, db, input.petId);
  const subject = await shopPet(ctx, db, b.id, input.petId);
  if (subject.blacklisted) throw new AppError("CUSTOMER_BLACKLISTED");

  const ids = [...new Set([...input.serviceIds, ...input.addonIds])];
  const services = (await tdb.select(
    service,
    and(eq(service.branchId, b.id), inArray(service.id, ids)),
  )) as (typeof service.$inferSelect)[];
  if (services.length !== ids.length) throw new AppError("NOT_FOUND");
  const fields: Record<string, string> = {};
  const bookable = (s: (typeof services)[number] | undefined, addon: boolean) =>
    s && s.scope === "grooming" && s.isAddon === addon && s.status === "active" && s.onlineBookable;
  input.serviceIds.forEach((id, i) => {
    if (
      !bookable(
        services.find((x) => x.id === id),
        false,
      )
    )
      fields[`serviceIds.${i}`] = "must be an online-bookable main grooming service";
  });
  input.addonIds.forEach((id, i) => {
    if (
      !bookable(
        services.find((x) => x.id === id),
        true,
      )
    )
      fields[`addonIds.${i}`] = "must be an online-bookable grooming add-on";
  });
  if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

  // R-01: from the weight; the customer's own size choice only when the pet has no weight
  let tierId = subject.tierId;
  if (subject.row.species !== "other" && subject.row.latestWeightGrams === null) {
    if (!input.sizeTierId) throw new AppError("WEIGHT_REQUIRED");
    const [tier] = await tdb.select(sizeTier, and(eq(sizeTier.branchId, b.id), eq(sizeTier.id, input.sizeTierId)));
    if (!tier) throw new AppError("NOT_FOUND");
    tierId = input.sizeTierId;
  }

  // R-02 per service on the default plan; R-03 sums
  const planId = await defaultPlanId(ctx, db, b.id);
  const prices = planId
    ? ((await tdb.select(
        servicePrice,
        and(eq(servicePrice.ratePlanId, planId), inArray(servicePrice.serviceId, ids)),
      )) as (typeof servicePrice.$inferSelect)[])
    : [];
  const coatGroup = coatGroupOf({ coatType: subject.row.coatType });
  let priceSatang = 0;
  let durationMinutes = 0;
  for (const serviceId of [...input.serviceIds, ...input.addonIds]) {
    const found = lookupServicePrice({ serviceId, sizeTierId: tierId, coatGroup, prices });
    if (!found) throw new AppError("PRICE_NOT_FOUND");
    priceSatang += found.priceSatang;
    durationMinutes += found.durationMinutes;
  }

  const { reason, slots } = await groomDaySlots(ctx, db, {
    branch: b,
    date: input.date,
    channel: "online",
    durationMinutes,
    groomerId: input.groomerId,
  });
  return {
    date: input.date,
    reason,
    slots,
    durationMinutes,
    priceSatang,
  };
}
