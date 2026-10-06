import { z } from "zod";
import { Uuid } from "../common.ts";
import { PaymentInstruction } from "../dto/payment-instruction.ts";

export const LiffPayUploadSlipParams = z.object({ branchSlug: z.string().min(1), billId: Uuid });
export const LiffPayUploadSlipRequest = z
  .object({
    fileId: Uuid,
    /** R-05 step 1: text the client read from the slip's QR (absent when unreadable) */
    qrPayload: z.string().max(1000).optional(),
  })
  .strict();
export type LiffPayUploadSlipRequest = z.infer<typeof LiffPayUploadSlipRequest>;
export const LiffPayUploadSlipResponse = PaymentInstruction;
export type LiffPayUploadSlipResponse = z.infer<typeof LiffPayUploadSlipResponse>;
