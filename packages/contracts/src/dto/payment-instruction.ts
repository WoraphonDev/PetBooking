import { z } from "zod";
import { IsoInstant, Money } from "../common.ts";

/** 05#dto-PaymentInstruction — what the customer pays and the PromptPay QR (R-30). */
export const PaymentInstruction = z.object({
  /** deposit_required − deposit_verified, or the bill amount due */
  amountSatang: Money,
  /** R-30 EMVCo payload */
  promptpayPayload: z.string(),
  accountName: z.string().nullable(),
  /** last 3 digits of branch.promptpay_id */
  promptpayIdMasked: z.string(),
  expiresAt: IsoInstant.nullable(),
});
export type PaymentInstruction = z.infer<typeof PaymentInstruction>;
