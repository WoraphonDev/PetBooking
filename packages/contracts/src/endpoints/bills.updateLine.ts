import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsUpdateLineParams = z.object({ lineId: Uuid });
export const BillsUpdateLineRequest = z.object({
  /** ≤ quantity × unit price (LINE_DISCOUNT_TOO_LARGE) */
  lineDiscountSatang: Money.nonnegative().optional(),
  /** required (≥ 3 chars) when the discount is > 0 — REASON_REQUIRED */
  lineDiscountReason: z.string().trim().optional(),
  performerId: Uuid.nullable().optional(),
  /** quick_item lines only */
  quantity: z.number().int().min(1).optional(),
});
export type BillsUpdateLineRequest = z.infer<typeof BillsUpdateLineRequest>;
export const BillsUpdateLineResponse = BillDetail;
export type BillsUpdateLineResponse = z.infer<typeof BillsUpdateLineResponse>;
