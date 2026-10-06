import { z } from "zod";
import { LocalTime, Money, Uuid } from "../common.ts";
import { ServiceItem } from "../dto/service-item.ts";
import { recordStatus, species } from "../enums.ts";

// Q-1032: 05 §2 DTOs RoomTypeItem and ShopPublic belong to this task, but dto/room-type-item.ts and dto/shop-public.ts
// are not in its allowed_paths, so they live here until a card owning those files moves them.

/** 05#dto-RoomTypeItem */
export const RoomTypeItem = z.object({
  id: Uuid,
  nameTh: z.string(),
  description: z.string().nullable(),
  photoUrl: z.string().nullable(),
  speciesAllowed: z.array(species),
  maxWeightGrams: z.number().int().nullable(),
  minAgeMonths: z.number().int().nullable(),
  allowInHeat: z.boolean(),
  allowReactive: z.boolean(),
  amenities: z.array(z.string()),
  includedText: z.string().nullable(),
  onlineBookable: z.boolean(),
  sortOrder: z.number().int(),
  status: recordStatus,
  rates: z.array(z.object({ sizeTierId: Uuid.nullable(), nightlyPriceSatang: Money })),
  unitCount: z.number().int(),
});
export type RoomTypeItem = z.infer<typeof RoomTypeItem>;

/** 05#dto-ShopPublic */
export const ShopPublic = z.object({
  name: z.string(),
  logoUrl: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  hours: z.array(
    z.object({ weekday: z.number().int(), isClosed: z.boolean(), opensAt: LocalTime.nullable(), closesAt: LocalTime.nullable() }),
  ),
  modules: z.object({ grooming: z.boolean(), hotel: z.boolean(), daycare: z.boolean() }),
  policyText: z.string().nullable(),
  services: z.array(ServiceItem),
  roomTypes: z.array(RoomTypeItem),
  addFriendUrl: z.string().nullable(),
  liffUrl: z.string().nullable(),
  /** Q-1030: liff.init needs the id itself */
  liffId: z.string().nullable(),
});
export type ShopPublic = z.infer<typeof ShopPublic>;

export const LiffShopParams = z.object({ branchSlug: z.string().min(1) });
export const LiffShopRequest = LiffShopParams;
export type LiffShopRequest = z.infer<typeof LiffShopRequest>;
export const LiffShopResponse = ShopPublic;
export type LiffShopResponse = z.infer<typeof LiffShopResponse>;
