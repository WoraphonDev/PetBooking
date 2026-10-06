import { z } from "zod";
import { Uuid } from "../common.ts";
import { MyBookingDetail } from "../dto/my-booking-detail.ts";

export const LiffBookingParams = z.object({ branchSlug: z.string().min(1), bookingId: Uuid });
export const LiffBookingRequest = LiffBookingParams;
export type LiffBookingRequest = z.infer<typeof LiffBookingRequest>;
export const LiffBookingResponse = MyBookingDetail;
export type LiffBookingResponse = z.infer<typeof LiffBookingResponse>;
