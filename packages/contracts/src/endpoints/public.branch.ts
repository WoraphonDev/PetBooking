import { z } from "zod";
import { ShopPublic } from "./liff.shop.ts";

export const PublicBranchParams = z.object({ bookingSlug: z.string().min(1) });
export const PublicBranchRequest = PublicBranchParams;
export type PublicBranchRequest = z.infer<typeof PublicBranchRequest>;
/** 05#dto-ShopPublic (defined in liff.shop until a card owns dto/shop-public.ts, Q-1032) */
export const PublicBranchResponse = ShopPublic;
export type PublicBranchResponse = z.infer<typeof PublicBranchResponse>;
