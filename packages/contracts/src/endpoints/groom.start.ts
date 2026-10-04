import { z } from "zod";
import { Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomStartParams = z.object({ appointmentId: Uuid });
export const GroomStartRequest = GroomStartParams;
export type GroomStartRequest = z.infer<typeof GroomStartRequest>;
export const GroomStartResponse = AppointmentCard;
export type GroomStartResponse = z.infer<typeof GroomStartResponse>;
