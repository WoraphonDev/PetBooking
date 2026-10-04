import { z } from "zod";
import { Money, Uuid } from "../common.ts";

export const BookingsCancelPreviewParams = z.object({ bookingId: Uuid });
export const BookingsCancelPreviewQuery = z.object({ kind: z.enum(["customer_cancel", "shop_cancel"]) });
export type BookingsCancelPreviewQuery = z.infer<typeof BookingsCancelPreviewQuery>;
export const BookingsCancelPreviewRequest = BookingsCancelPreviewParams.extend(BookingsCancelPreviewQuery.shape);
export type BookingsCancelPreviewRequest = z.infer<typeof BookingsCancelPreviewRequest>;
/** 05: `object R-07 CancelResult` */
export const BookingsCancelPreviewResponse = z.object({
  isLate: z.boolean(),
  minutesBefore: z.number().int(),
  freeCancelHours: z.number().int(),
  forfeitSatang: Money,
  returnSatang: Money,
  returnMode: z.enum(["refund", "credit", "none"]).nullable(),
});
export type BookingsCancelPreviewResponse = z.infer<typeof BookingsCancelPreviewResponse>;
