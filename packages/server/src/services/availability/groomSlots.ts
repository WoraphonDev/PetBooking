import type { AvailabilityGroomSlotsRequest, AvailabilityGroomSlotsResponse } from "@app/contracts/endpoints/availability.groomSlots";
import { service, servicePrice, sizeTier } from "@app/db/schema";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { groomDaySlots } from "./groom-slots-core.ts";
import { defaultPlanId, scopedBranch, shopPet } from "./hotel.ts";


/** R-04 slots for one pet on one day, with R-02/R-03 price and duration (05#ep-availability.groomSlots). */
export async function availabilityGroomSlots(
  ctx: RequestContext,
  input: AvailabilityGroomSlotsRequest,
): Promise<AvailabilityGroomSlotsResponse> {
  requireRole(ctx, "availability.groomSlots");
  const db = getDb();
  const tdb = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  const subject = await shopPet(ctx, db, b.id, input.petId);

  // services: main ones in serviceIds, add-ons in addonIds — all active grooming services of this branch
  const ids = [...new Set([...input.serviceIds, ...input.addonIds])];
  const services = (await tdb.select(
    service,
    and(eq(service.branchId, b.id), inArray(service.id, ids)),
  )) as (typeof service.$inferSelect)[];
  if (services.length !== ids.length) throw new AppError("NOT_FOUND");
  const fields: Record<string, string> = {};
  input.serviceIds.forEach((id, i) => {
    const s = services.find((x) => x.id === id);
    if (s && (s.scope !== "grooming" || s.isAddon || s.status !== "active"))
      fields[`serviceIds.${i}`] = "must be an active main grooming service";
  });
  input.addonIds.forEach((id, i) => {
    const s = services.find((x) => x.id === id);
    if (s && (s.scope !== "grooming" || !s.isAddon || s.status !== "active")) fields[`addonIds.${i}`] = "must be an active grooming add-on";
  });
  if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

  // R-01: shop override, else from weight
  let tierId = subject.tierId;
  if (input.sizeTierId) {
    const [tier] = await tdb.select(sizeTier, and(eq(sizeTier.branchId, b.id), eq(sizeTier.id, input.sizeTierId)));
    if (!tier) throw new AppError("NOT_FOUND");
    tierId = input.sizeTierId;
  } else if (subject.row.species !== "other" && subject.row.latestWeightGrams === null) throw new AppError("WEIGHT_REQUIRED");

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
    channel: "staff",
    durationMinutes,
    groomerId: input.groomerId,
    excludeAppointmentId: input.excludeAppointmentId,
    pendingAppointments: input.pendingAppointments,
  });
  return {
    date: input.date,
    reason,
    slots,
    durationMinutes,
    priceSatang,
  };
}
