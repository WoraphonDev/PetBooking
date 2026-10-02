import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { CustomerDetail } from "../dto/customer-detail.ts";

export const CustomersCreditParams = z.object({ customerId: Uuid });
export const CustomersCreditRequest = z.object({
  deltaSatang: Money.refine((n) => n !== 0, "must not be 0"),
  /** ≥ 3 chars — checked by the service (REASON_REQUIRED) */
  reason: z.string().trim().optional(),
});
export type CustomersCreditRequest = z.infer<typeof CustomersCreditRequest>;
export const CustomersCreditResponse = CustomerDetail;
export type CustomersCreditResponse = z.infer<typeof CustomersCreditResponse>;
