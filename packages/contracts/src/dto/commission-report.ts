import { z } from "zod";
import { IsoInstant, LocalDate, Money, Uuid } from "../common.ts";

/**
 * 05#dto-CommissionReport. Per staff row, entries earned in from..to count positive and entries reversed in from..to count
 * negative (Q-0030), so a void after the earning period shows up as a deduction in the period it happened.
 */
export const CommissionReport = z.object({
  from: LocalDate,
  to: LocalDate,
  rows: z.array(
    z.object({
      staffUserId: Uuid,
      staffName: z.string(),
      jobs: z.number().int(),
      baseSatang: Money,
      amountSatang: Money,
      /** Q-0077: one item per counted event — earned (+1) or reversed (−1) in from..to */
      entries: z.array(
        z.object({
          id: Uuid,
          at: IsoInstant,
          sign: z.union([z.literal(1), z.literal(-1)]),
          receiptNo: z.string().nullable(),
          serviceName: z.string(),
          baseSatang: Money,
          /** "10%" (percent) or "฿50" (fixed); null when the rule was removed */
          ruleLabel: z.string().nullable(),
          amountSatang: Money,
        }),
      ),
    }),
  ),
});
export type CommissionReport = z.infer<typeof CommissionReport>;
