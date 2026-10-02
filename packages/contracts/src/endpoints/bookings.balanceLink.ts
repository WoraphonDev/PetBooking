import { z } from "zod";
import { Uuid } from "../common.ts";

export const BookingsBalanceLinkParams = z.object({ bookingId: Uuid });
/** 05 names only "send=true" (Q-0040): push the link to the customer's LINE as well. */
export const BookingsBalanceLinkRequest = z.object({ send: z.boolean().optional() });
export type BookingsBalanceLinkRequest = z.infer<typeof BookingsBalanceLinkRequest>;
export const BookingsBalanceLinkResponse = z.object({ url: z.string(), amountSatang: z.number().int() });
export type BookingsBalanceLinkResponse = z.infer<typeof BookingsBalanceLinkResponse>;
