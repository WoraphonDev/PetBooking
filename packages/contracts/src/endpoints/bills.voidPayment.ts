import { z } from "zod";
import { Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsVoidPaymentParams = z.object({ paymentId: Uuid });
export const BillsVoidPaymentRequest = z.object({
  /** required, ≥ 3 chars — REASON_REQUIRED */
  reason: z.string().trim().optional(),
});
export type BillsVoidPaymentRequest = z.infer<typeof BillsVoidPaymentRequest>;
export const BillsVoidPaymentResponse = BillDetail;
export type BillsVoidPaymentResponse = z.infer<typeof BillsVoidPaymentResponse>;
