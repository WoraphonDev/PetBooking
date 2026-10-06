import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { bookingStatus, depositStatus } from "../enums.ts";

/** 05#dto-MyBookingItem — a booking on "my bookings" (LIFF) */
export const MyBookingItem = z.object({
  id: Uuid,
  bookingNo: z.string(),
  status: bookingStatus,
  firstServiceAt: IsoInstant.nullable(),
  petNames: z.array(z.string()),
  /** service / room type / daycare session names */
  summary: z.string(),
  depositStatus,
  estimatedTotalSatang: Money,
  /** R-21 */
  canCancel: z.boolean(),
  canReschedule: z.boolean(),
});
export type MyBookingItem = z.infer<typeof MyBookingItem>;
