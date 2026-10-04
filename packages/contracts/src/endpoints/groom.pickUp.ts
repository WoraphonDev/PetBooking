import { z } from "zod";
import { Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomPickUpParams = z.object({ appointmentId: Uuid });
export const GroomPickUpRequest = GroomPickUpParams;
export type GroomPickUpRequest = z.infer<typeof GroomPickUpRequest>;
export const GroomPickUpResponse = AppointmentCard;
export type GroomPickUpResponse = z.infer<typeof GroomPickUpResponse>;
