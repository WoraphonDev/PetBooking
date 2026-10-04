import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomRescheduleParams = z.object({ appointmentId: Uuid });
export const GroomRescheduleRequest = z.object({
  /** must be an R-04 slot (this appointment excluded) */
  startsAt: IsoInstant,
  groomerId: Uuid,
  stationId: Uuid,
  reason: z.string().trim().max(500).optional(),
  notifyCustomer: z.boolean().default(true),
});
export type GroomRescheduleRequest = z.infer<typeof GroomRescheduleRequest>;
export const GroomRescheduleResponse = AppointmentCard;
export type GroomRescheduleResponse = z.infer<typeof GroomRescheduleResponse>;
