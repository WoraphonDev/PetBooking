import { z } from "zod";
import { Uuid } from "../common.ts";
import { MyBookingDetail } from "../dto/my-booking-detail.ts";

export const LiffUploadSlipParams = z.object({ branchSlug: z.string().min(1), bookingId: Uuid });
export const LiffUploadSlipRequest = z
  .object({
    /** a `slip` file */
    fileId: Uuid,
    /** R-05 step 1: text the client decoded from the slip's QR (absent when unreadable) */
    qrPayload: z.string().max(1000).optional(),
  })
  .strict();
export type LiffUploadSlipRequest = z.infer<typeof LiffUploadSlipRequest>;
export const LiffUploadSlipResponse = MyBookingDetail;
export type LiffUploadSlipResponse = z.infer<typeof LiffUploadSlipResponse>;
