import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const BookingsGetParams = z.object({ bookingId: Uuid });
export const BookingsGetRequest = BookingsGetParams;
export type BookingsGetRequest = z.infer<typeof BookingsGetRequest>;
export const BookingsGetResponse = BookingDetail;
export type BookingsGetResponse = z.infer<typeof BookingsGetResponse>;
