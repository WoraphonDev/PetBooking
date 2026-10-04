import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { SlipItem } from "../dto/slip-item.ts";

export const SlipsVerifyParams = z.object({ slipId: Uuid });
export const SlipsVerifyRequest = z.object({
  /** the amount that really arrived */
  amountSatang: Money.positive(),
  /** must be true for a slip flagged as a duplicate (R-05) */
  confirmDuplicate: z.boolean().default(false),
  /** also approve a booking that needs approval, in the same call */
  approveBooking: z.boolean().default(false),
});
export type SlipsVerifyRequest = z.infer<typeof SlipsVerifyRequest>;
export const SlipsVerifyResponse = SlipItem;
export type SlipsVerifyResponse = z.infer<typeof SlipsVerifyResponse>;
