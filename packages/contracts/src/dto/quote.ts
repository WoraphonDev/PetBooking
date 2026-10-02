import { z } from "zod";
import { IsoInstant, Money } from "../common.ts";

export const Quote = z.object({
  groom: z.array(z.object({ servicesTotalSatang: Money, durationMinutes: z.number().int(), endsAt: IsoInstant, blockedUntil: IsoInstant })),
  stays: z.array(
    z.object({
      nights: z.number().int(),
      roomTotalSatang: Money,
      addons: z.array(z.object({ quantity: z.number().int(), totalSatang: Money })),
      addonsTotalSatang: Money,
    }),
  ),
  daycareTotalSatang: Money,
  estimatedTotalSatang: Money,
  depositRequiredSatang: Money,
  depositReason: z.enum(["exempt", "reliability_full_prepay", "reliability_min_30", "policy_none", "policy_fixed", "policy_percent"]),
  requiresApproval: z.boolean(),
  policyText: z.string(),
  cancelSummary: z.string(),
});
export type Quote = z.infer<typeof Quote>;
