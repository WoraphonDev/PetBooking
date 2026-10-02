import { z } from "zod";
import { Uuid } from "../common.ts";
import { CustomerDetail } from "../dto/customer-detail.ts";

export const CustomersBlacklistParams = z.object({ customerId: Uuid });
export const CustomersBlacklistRequest = z.object({
  blacklisted: z.boolean(),
  /** ≥ 3 chars — checked by the service (REASON_REQUIRED) */
  reason: z.string().trim().optional(),
});
export type CustomersBlacklistRequest = z.infer<typeof CustomersBlacklistRequest>;
export const CustomersBlacklistResponse = CustomerDetail;
export type CustomersBlacklistResponse = z.infer<typeof CustomersBlacklistResponse>;
