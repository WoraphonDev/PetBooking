import { z } from "zod";
import { Uuid } from "../common.ts";
import { CustomerDetail } from "../dto/customer-detail.ts";

export const CustomersReliabilityOverrideParams = z.object({ customerId: Uuid });
export const CustomersReliabilityOverrideRequest = z.object({
  /** 1–4, or null = back to the R-09 value */
  level: z.number().int().min(1).max(4).nullable().optional(),
  reason: z.string().trim().min(3),
});
export type CustomersReliabilityOverrideRequest = z.infer<typeof CustomersReliabilityOverrideRequest>;
export const CustomersReliabilityOverrideResponse = CustomerDetail;
export type CustomersReliabilityOverrideResponse = z.infer<typeof CustomersReliabilityOverrideResponse>;
