import { z } from "zod";
import { Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomRemoveSurchargeParams = z.object({ surchargeId: Uuid });
export const GroomRemoveSurchargeRequest = GroomRemoveSurchargeParams;
export type GroomRemoveSurchargeRequest = z.infer<typeof GroomRemoveSurchargeRequest>;
export const GroomRemoveSurchargeResponse = AppointmentCard;
export type GroomRemoveSurchargeResponse = z.infer<typeof GroomRemoveSurchargeResponse>;
