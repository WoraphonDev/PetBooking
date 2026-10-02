import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { bookingChannel, bookingStatus, depositStatus, serviceScope } from "../enums.ts";

/** 05#dto-BookingListItem — a row in a booking list. */
export const BookingListItem = z.object({
  id: Uuid,
  bookingNo: z.string(),
  status: bookingStatus,
  channel: bookingChannel,
  customerId: Uuid,
  /** owner_profile.first_name + nickname */
  customerName: z.string(),
  firstServiceAt: IsoInstant.nullable(),
  /** grooming/hotel/daycare present in the booking */
  modules: z.array(serviceScope),
  petNames: z.array(z.string()),
  estimatedTotalSatang: Money,
  depositStatus,
  depositRequiredSatang: Money,
  holdExpiresAt: IsoInstant.nullable(),
  approvalDueAt: IsoInstant.nullable(),
  createdAt: IsoInstant,
});
export type BookingListItem = z.infer<typeof BookingListItem>;
