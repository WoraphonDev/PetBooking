import { z } from "zod";
import { Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomFinishParams = z.object({ appointmentId: Uuid });
export const GroomFinishRequest = z.object({
  /** note to the shop, ≤ 1000 */
  staffNote: z.string().trim().max(1000).optional(),
});
export type GroomFinishRequest = z.infer<typeof GroomFinishRequest>;
export const GroomFinishResponse = AppointmentCard;
export type GroomFinishResponse = z.infer<typeof GroomFinishResponse>;
