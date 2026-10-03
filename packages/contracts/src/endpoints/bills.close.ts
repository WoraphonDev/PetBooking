import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsCloseParams = z.object({ billId: Uuid });
export const BillsCloseRequest = z.object({
  /** bill.paid_satang the cashier saw; a different value → STALE_BILL */
  expectedPaidSatang: Money.nonnegative(),
});
export type BillsCloseRequest = z.infer<typeof BillsCloseRequest>;
export const BillsCloseResponse = BillDetail;
export type BillsCloseResponse = z.infer<typeof BillsCloseResponse>;
