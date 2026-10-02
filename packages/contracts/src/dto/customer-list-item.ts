import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { species } from "../enums.ts";

/** 05#dto-CustomerListItem — a row in the customer list / search results. */
export const CustomerListItem = z.object({
  id: Uuid,
  firstName: z.string(),
  lastName: z.string().nullable(),
  nickname: z.string().nullable(),
  /** owner_profile.phone_e164 */
  phone: z.string().nullable(),
  pets: z.array(z.object({ id: Uuid, name: z.string(), species })),
  /** coalesce(customer.reliability_override, customer.reliability_level) */
  reliabilityLevel: z.number().int().min(1).max(4),
  blacklisted: z.boolean(),
  lastVisitAt: IsoInstant.nullable(),
  visitCount: z.number().int(),
  creditBalanceSatang: Money,
  /** the owner_profile has a line_identity */
  lineLinked: z.boolean(),
});
export type CustomerListItem = z.infer<typeof CustomerListItem>;
