import { z } from "zod";
import { Uuid } from "../common.ts";
import { SlipItem } from "../dto/slip-item.ts";

export const SlipsRejectParams = z.object({ slipId: Uuid });
/** shown to the customer */
export const SlipsRejectRequest = z.object({ reason: z.string().trim().min(3).max(500) });
export type SlipsRejectRequest = z.infer<typeof SlipsRejectRequest>;
export const SlipsRejectResponse = SlipItem;
export type SlipsRejectResponse = z.infer<typeof SlipsRejectResponse>;
