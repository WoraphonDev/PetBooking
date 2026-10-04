import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const BookingsWaiveDepositParams = z.object({ bookingId: Uuid });
export const BookingsWaiveDepositRequest = z.object({ reason: z.string().trim().min(3).max(500) });
export type BookingsWaiveDepositRequest = z.infer<typeof BookingsWaiveDepositRequest>;
export const BookingsWaiveDepositResponse = BookingDetail;
export type BookingsWaiveDepositResponse = z.infer<typeof BookingsWaiveDepositResponse>;
