import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const StaysCancelParams = z.object({ stayId: Uuid });
export const StaysCancelRequest = z.object({ reason: z.string().trim().min(1).max(500) });
export type StaysCancelRequest = z.infer<typeof StaysCancelRequest>;
export const StaysCancelResponse = BookingDetail;
export type StaysCancelResponse = z.infer<typeof StaysCancelResponse>;
