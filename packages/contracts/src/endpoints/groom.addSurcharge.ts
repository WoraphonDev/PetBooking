import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomAddSurchargeParams = z.object({ appointmentId: Uuid });
export const GroomAddSurchargeRequest = z.object({
  surchargeTypeId: Uuid.optional(),
  name: z.string().trim().min(1).max(60),
  amountSatang: Money.positive(),
  /** shown to the customer on the bill */
  reason: z.string().trim().min(3).max(500),
});
export type GroomAddSurchargeRequest = z.infer<typeof GroomAddSurchargeRequest>;
export const GroomAddSurchargeResponse = AppointmentCard;
export type GroomAddSurchargeResponse = z.infer<typeof GroomAddSurchargeResponse>;
