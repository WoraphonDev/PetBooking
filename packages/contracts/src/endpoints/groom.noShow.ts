import { z } from "zod";
import { Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomNoShowParams = z.object({ appointmentId: Uuid });
export const GroomNoShowRequest = z.object({ reason: z.string().trim().max(500).optional() });
export type GroomNoShowRequest = z.infer<typeof GroomNoShowRequest>;
export const GroomNoShowResponse = AppointmentCard;
export type GroomNoShowResponse = z.infer<typeof GroomNoShowResponse>;
