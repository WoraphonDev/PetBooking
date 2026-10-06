import { z } from "zod";
import { MyBookingItem } from "../dto/my-booking-item.ts";

export const LiffBookingsParams = z.object({ branchSlug: z.string().min(1) });
/** upcoming (default) = still open bookings, past = cancelled / expired / closed (Q-1036) */
export const LiffBookingsQuery = z.object({ scope: z.enum(["upcoming", "past"]).optional() });
export type LiffBookingsQuery = z.infer<typeof LiffBookingsQuery>;
export const LiffBookingsRequest = LiffBookingsParams.extend(LiffBookingsQuery.shape);
export type LiffBookingsRequest = z.infer<typeof LiffBookingsRequest>;
export const LiffBookingsResponse = z.array(MyBookingItem);
export type LiffBookingsResponse = z.infer<typeof LiffBookingsResponse>;
