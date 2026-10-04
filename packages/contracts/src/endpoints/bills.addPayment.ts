import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsAddPaymentParams = z.object({ billId: Uuid });
/** 05#ep-bills.addPayment — deposits are added by bills.open, not here (R-15 step 4). */
export const BillsAddPaymentRequest = z
  .object({
    method: z.enum(["cash", "promptpay", "bank_transfer", "card_edc", "credit"]),
    /** cash: money handed over (required) */
    tenderedSatang: Money.optional(),
    /** other methods: required, ≤ due */
    amountSatang: Money.optional(),
    /** EDC slip no. / transfer reference */
    reference: z.string().trim().max(100).optional(),
    slipId: Uuid.optional(),
    proofFileId: Uuid.optional(),
    /** bill.paid_satang as the screen saw it (R-15 step 6) — STALE_BILL when the DB differs */
    expectedPaidSatang: Money.nonnegative(),
  })
  .superRefine((b, issue) => {
    if (b.method === "cash" && b.tenderedSatang === undefined)
      issue.addIssue({ code: "custom", path: ["tenderedSatang"], message: "required for cash" });
    if (b.method !== "cash" && b.amountSatang === undefined)
      issue.addIssue({ code: "custom", path: ["amountSatang"], message: "required for this method" });
  });
export type BillsAddPaymentRequest = z.infer<typeof BillsAddPaymentRequest>;
export const BillsAddPaymentResponse = BillDetail;
export type BillsAddPaymentResponse = z.infer<typeof BillsAddPaymentResponse>;
