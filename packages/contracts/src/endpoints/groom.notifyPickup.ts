import { z } from "zod";
import { Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomNotifyPickupParams = z.object({ appointmentId: Uuid });
export const GroomNotifyPickupRequest = GroomNotifyPickupParams;
export type GroomNotifyPickupRequest = z.infer<typeof GroomNotifyPickupRequest>;
export const GroomNotifyPickupResponse = AppointmentCard;
export type GroomNotifyPickupResponse = z.infer<typeof GroomNotifyPickupResponse>;
