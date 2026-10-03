import { z } from "zod";
import { LocalDate, Money } from "../common.ts";
import { paymentMethod } from "../enums.ts";

const Amounts = { billCount: z.number().int(), grossSatang: Money, discountSatang: Money, netSatang: Money };

/** 05#dto-SalesReport (Q-0085): gross = Σ qty × unit, discount = line + spread bill discount, net = gross − discount. */
export const SalesReport = z.object({
  from: LocalDate,
  to: LocalDate,
  /** day: YYYY-MM-DD · service: line description · groomer: staff name (null = ไม่ระบุช่าง) · method: payment method */
  rows: z.array(z.object({ key: z.string().nullable(), ...Amounts })),
  totals: z.object(Amounts),
  payments: z.array(z.object({ method: paymentMethod, amountSatang: Money })),
});
export type SalesReport = z.infer<typeof SalesReport>;
