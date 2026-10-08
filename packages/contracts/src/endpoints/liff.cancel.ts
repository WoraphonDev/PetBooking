import { z } from "zod";
import { Uuid } from "../common.ts";
import { MyBookingDetail } from "../dto/my-booking-detail.ts";

export const LiffCancelParams = z.object({ branchSlug: z.string().min(1), bookingId: Uuid });
export const LiffCancelRequest = z
  .object({
    /** R-07: refund | credit, used when the booked policy is customer_choice (no choice = credit) */
    customerChoice: z.enum(["refund", "credit"]).optional(),
    /** booking.cancel_reason */
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type LiffCancelRequest = z.infer<typeof LiffCancelRequest>;
export const LiffCancelResponse = MyBookingDetail;
export type LiffCancelResponse = z.infer<typeof LiffCancelResponse>;
