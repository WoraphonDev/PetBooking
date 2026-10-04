import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const GroomCancelParams = z.object({ appointmentId: Uuid });
export const GroomCancelRequest = z.object({ reason: z.string().trim().min(3) });
export type GroomCancelRequest = z.infer<typeof GroomCancelRequest>;
export const GroomCancelResponse = BookingDetail;
export type GroomCancelResponse = z.infer<typeof GroomCancelResponse>;
