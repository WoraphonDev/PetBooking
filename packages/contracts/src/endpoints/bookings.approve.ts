import { z } from "zod";
import { Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const BookingsApproveParams = z.object({ bookingId: Uuid });
export const BookingsApproveRequest = BookingsApproveParams;
export type BookingsApproveRequest = z.infer<typeof BookingsApproveRequest>;
export const BookingsApproveResponse = BookingDetail;
export type BookingsApproveResponse = z.infer<typeof BookingsApproveResponse>;
