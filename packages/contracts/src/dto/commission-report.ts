import { z } from "zod";
import { LocalDate, Money, Uuid } from "../common.ts";

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
      entries: z.array(Uuid),
    }),
  ),
});
export type CommissionReport = z.infer<typeof CommissionReport>;
