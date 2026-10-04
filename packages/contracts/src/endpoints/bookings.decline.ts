import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const BookingsDeclineParams = z.object({ bookingId: Uuid });
/** reason is shown to the customer */
export const BookingsDeclineRequest = z.object({ reason: z.string().trim().min(3).max(500) });
export type BookingsDeclineRequest = z.infer<typeof BookingsDeclineRequest>;
export const BookingsDeclineResponse = BookingDetail;
export type BookingsDeclineResponse = z.infer<typeof BookingsDeclineResponse>;
