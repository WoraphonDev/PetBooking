import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const BookingsCancelParams = z.object({ bookingId: Uuid });
export const BookingsCancelRequest = z.object({
  kind: z.enum(["customer_cancel", "shop_cancel"]),
  reason: z.string().trim().min(3).max(500),
  /** R-07 customer_choice: refund or credit (no choice = credit) */
  customerChoice: z.enum(["refund", "credit"]).optional(),
});
export type BookingsCancelRequest = z.infer<typeof BookingsCancelRequest>;
export const BookingsCancelResponse = BookingDetail;
export type BookingsCancelResponse = z.infer<typeof BookingsCancelResponse>;
