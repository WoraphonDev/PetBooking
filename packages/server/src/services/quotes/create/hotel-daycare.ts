import type { QuotesCreateRequest } from "@app/contracts/endpoints/quotes.create";
import { daycareRate, daycareSessionType, roomRate, roomType, roomUnit, service, servicePrice } from "@app/db/schema";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { and, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import type { Executor } from "../../../db.ts";
import { AppError } from "../../../errors.ts";
import { tenantDb } from "../../../repo/tenant.ts";
import { pickPrice, shopPet } from "../../availability/hotel.ts";

type Scope = { ctx: RequestContext; db: Executor; branchId: string; planId: string | null; ownerProfileId: string };
type Pet = Awaited<ReturnType<typeof shopPet>>;

/** a pet of the quoted customer, with its R-01 size tier */
export async function customerPet(s: Scope, petId: string): Promise<Pet> {
  const subject = await shopPet(s.ctx, s.db, s.branchId, petId);
  if (subject.row.ownerProfileId !== s.ownerProfileId) throw new AppError("NOT_FOUND");
  return subject;
}

/** R-03 stay input: nightly room rate for the pet's tier (default plan) and hotel add-ons (per day or once). */
export async function priceStay(s: Scope, item: QuotesCreateRequest["stays"][number], index: number) {
  const repo = tenantDb(s.ctx, s.db);
  const subject = await customerPet(s, item.petId);
  const [type] = await repo.select(roomType, and(eq(roomType.id, item.roomTypeId), eq(roomType.branchId, s.branchId)));
  if (!type) throw new AppError("NOT_FOUND");
  if (item.roomUnitId) {
    const [unit] = await repo.select(roomUnit, and(eq(roomUnit.id, item.roomUnitId), eq(roomUnit.roomTypeId, item.roomTypeId)));
    if (!unit) throw new AppError("NOT_FOUND");
  }
  const rates = s.planId
    ? ((await repo.select(
        roomRate,
        and(eq(roomRate.ratePlanId, s.planId), eq(roomRate.roomTypeId, item.roomTypeId)),
      )) as (typeof roomRate.$inferSelect)[])
    : [];
  const rate = pickPrice(rates, subject.tierId);
  if (!rate) throw new AppError("PRICE_NOT_FOUND");

  const ids = [...new Set(item.addonServiceIds)];
  const addons = ids.length
    ? ((await repo.select(service, and(eq(service.branchId, s.branchId), inArray(service.id, ids)))) as (typeof service.$inferSelect)[])
    : [];
  if (addons.length !== ids.length) throw new AppError("NOT_FOUND");
  if (addons.some((a) => a.scope !== "hotel" || !a.isAddon || a.status !== "active"))
    throw new AppError("VALIDATION_FAILED", { fields: { [`stays.${index}.addonServiceIds`]: "select active hotel add-ons" } });
  const prices =
    s.planId && ids.length
      ? ((await repo.select(
          servicePrice,
          and(eq(servicePrice.ratePlanId, s.planId), inArray(servicePrice.serviceId, ids)),
        )) as (typeof servicePrice.$inferSelect)[])
      : [];
  return {
    checkInDate: item.checkInDate,
    checkOutDate: item.checkOutDate,
    nightlyPriceSatang: rate.nightlyPriceSatang,
    addons: item.addonServiceIds.map((serviceId) => {
      const price = lookupServicePrice({
        serviceId,
        sizeTierId: subject.tierId,
        coatGroup: coatGroupOf({ coatType: subject.row.coatType }),
        prices,
      });
      if (!price) throw new AppError("PRICE_NOT_FOUND");
      return { unitPriceSatang: price.priceSatang, perDay: addons.find((a) => a.id === serviceId)?.addonPerDay ?? false };
    }),
  };
}

/** R-03 daycare input: the session's rate for the pet's tier (default plan). */
export async function priceDaycare(s: Scope, item: QuotesCreateRequest["daycare"][number]) {
  const repo = tenantDb(s.ctx, s.db);
  const subject = await customerPet(s, item.petId);
  const [session] = await repo.select(
    daycareSessionType,
    and(eq(daycareSessionType.id, item.sessionTypeId), eq(daycareSessionType.branchId, s.branchId)),
  );
  if (!session) throw new AppError("NOT_FOUND");
  const rates = s.planId
    ? ((await repo.select(
        daycareRate,
        and(eq(daycareRate.ratePlanId, s.planId), eq(daycareRate.sessionTypeId, item.sessionTypeId)),
      )) as (typeof daycareRate.$inferSelect)[])
    : [];
  const rate = pickPrice(rates, subject.tierId);
  if (!rate) throw new AppError("PRICE_NOT_FOUND");
  return { priceSatang: rate.priceSatang };
}
