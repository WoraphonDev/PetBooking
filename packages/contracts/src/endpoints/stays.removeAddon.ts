import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysRemoveAddonParams = z.object({ stayAddonId: Uuid });
export const StaysRemoveAddonRequest = StaysRemoveAddonParams;
export type StaysRemoveAddonRequest = z.infer<typeof StaysRemoveAddonRequest>;
export const StaysRemoveAddonResponse = StayDetail;
export type StaysRemoveAddonResponse = z.infer<typeof StaysRemoveAddonResponse>;
