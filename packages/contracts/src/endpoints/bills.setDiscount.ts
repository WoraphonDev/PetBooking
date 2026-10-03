import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsSetDiscountParams = z.object({ billId: Uuid });
export const BillsSetDiscountRequest = z.object({
  /** ≤ subtotal (BILL_DISCOUNT_TOO_LARGE) */
  billDiscountSatang: Money.nonnegative(),
  /** required (≥ 3 chars) when the discount is > 0 — REASON_REQUIRED */
  reason: z.string().trim().optional(),
});
export type BillsSetDiscountRequest = z.infer<typeof BillsSetDiscountRequest>;
export const BillsSetDiscountResponse = BillDetail;
export type BillsSetDiscountResponse = z.infer<typeof BillsSetDiscountResponse>;
