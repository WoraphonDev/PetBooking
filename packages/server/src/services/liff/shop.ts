import type { LiffShopRequest, LiffShopResponse, RoomTypeItem } from "@app/contracts/endpoints/liff.shop";
import { branch, branchHours, branchPolicy, lineChannel, ratePlan, roomRate, roomType, roomUnit, service } from "@app/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { serviceItem } from "../services/list.ts";

/** 05#dto-ShopPublic for the session's branch (also the shape public.branch returns) */
export async function shopPublic(ctx: RequestContext, db: Executor, branchId: string): Promise<LiffShopResponse> {
  const t = tenantDb(ctx, db);
  const [br] = (await t.select(branch, eq(branch.id, branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  // branch_hours / branch_policy have no organization_id: keyed by the org-checked branch
  const hours = await db.select().from(branchHours).where(eq(branchHours.branchId, br.id)).orderBy(asc(branchHours.weekday));
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
  const [channel] = (await t.select(lineChannel, eq(lineChannel.branchId, br.id))) as (typeof lineChannel.$inferSelect)[];

  // the customer sees what they can book: active + online_bookable; the shop's cost estimate stays internal (Q-1032)
  const services = (await t.select(
    service,
    and(eq(service.branchId, br.id), eq(service.status, "active"), eq(service.onlineBookable, true)),
  )) as (typeof service.$inferSelect)[];
  services.sort((a, b) => a.sortOrder - b.sortOrder);
  const serviceItems = await Promise.all(services.map(async (s) => ({ ...(await serviceItem(ctx, db, s)), estCostSatang: null })));

  const types = (await t.select(
    roomType,
    and(eq(roomType.branchId, br.id), eq(roomType.status, "active"), eq(roomType.onlineBookable, true)),
  )) as (typeof roomType.$inferSelect)[];
  types.sort((a, b) => a.sortOrder - b.sortOrder);
  const [defaultPlan] = (await t.select(
    ratePlan,
    and(eq(ratePlan.branchId, br.id), eq(ratePlan.isDefault, true)),
  )) as (typeof ratePlan.$inferSelect)[];
  const roomTypes: RoomTypeItem[] = [];
  for (const rt of types) {
    const rates = defaultPlan
      ? ((await t.select(
          roomRate,
          and(eq(roomRate.roomTypeId, rt.id), eq(roomRate.ratePlanId, defaultPlan.id)),
        )) as (typeof roomRate.$inferSelect)[])
      : [];
    const units = await t.select(roomUnit, and(eq(roomUnit.roomTypeId, rt.id), eq(roomUnit.status, "active")));
    roomTypes.push({
      id: rt.id,
      nameTh: rt.nameTh,
      description: rt.description,
      photoUrl: rt.photoFileId ? await signedUrl(db, ctx, rt.photoFileId) : null,
      speciesAllowed: rt.speciesAllowed,
      maxWeightGrams: rt.maxWeightGrams,
      minAgeMonths: rt.minAgeMonths,
      allowInHeat: rt.allowInHeat,
      allowReactive: rt.allowReactive,
      amenities: rt.amenities,
      includedText: rt.includedText,
      onlineBookable: rt.onlineBookable,
      sortOrder: rt.sortOrder,
      status: rt.status,
      rates: rates.map((r) => ({ sizeTierId: r.sizeTierId, nightlyPriceSatang: r.nightlyPriceSatang })),
      unitCount: units.length,
    });
  }

  const address = [br.addressLine, br.subdistrict, br.district, br.province, br.postalCode].filter((p) => p?.trim()).join(" ");
  return {
    name: br.name,
    logoUrl: br.logoFileId ? await signedUrl(db, ctx, br.logoFileId) : null,
    phone: br.phone,
    address: address || null,
    latitude: br.latitude,
    longitude: br.longitude,
    hours: hours.map((h) => ({
      weekday: h.weekday,
      isClosed: h.isClosed,
      opensAt: h.opensAt?.slice(0, 5) ?? null,
      closesAt: h.closesAt?.slice(0, 5) ?? null,
    })),
    modules: { grooming: br.moduleGrooming, hotel: br.moduleHotel, daycare: br.moduleDaycare },
    policyText: policy?.policyText ?? null,
    services: serviceItems,
    roomTypes,
    addFriendUrl: channel?.botBasicId ? `https://line.me/R/ti/p/${channel.botBasicId}` : null,
    liffUrl: channel ? `https://liff.line.me/${channel.liffId}` : null,
    liffId: channel?.liffId ?? null,
  };
}

export async function liffShop(ctx: RequestContext, _input: LiffShopRequest): Promise<LiffShopResponse> {
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  return shopPublic(ctx, getDb(), ctx.branchId);
}
