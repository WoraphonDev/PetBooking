import { z } from "zod";
import { Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

/** Q-0049: bookingIds of one customer; customerId only → empty bill for that customer; neither → walk-in bill */
export const BillsOpenRequest = z.object({
  bookingIds: z
    .array(Uuid)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate bookingId" })
    .optional(),
  customerId: Uuid.optional(),
});
export type BillsOpenRequest = z.infer<typeof BillsOpenRequest>;
export const BillsOpenResponse = BillDetail;
export type BillsOpenResponse = z.infer<typeof BillsOpenResponse>;
