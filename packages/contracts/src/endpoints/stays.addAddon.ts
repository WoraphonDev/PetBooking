import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysAddAddonParams = z.object({ stayId: Uuid });
/** quantity: default 1; a per-day add-on always takes the stay's nights */
export const StaysAddAddonRequest = z.object({ serviceId: Uuid, quantity: z.number().int().min(1).optional() });
export type StaysAddAddonRequest = z.infer<typeof StaysAddAddonRequest>;
export const StaysAddAddonResponse = StayDetail;
export type StaysAddAddonResponse = z.infer<typeof StaysAddAddonResponse>;
