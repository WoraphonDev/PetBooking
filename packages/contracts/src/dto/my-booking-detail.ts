import { z } from "zod";
import { IsoInstant, LocalDate } from "../common.ts";
import { BookingsCancelPreviewResponse } from "../endpoints/bookings.cancelPreview.ts";
import { MyBookingItem } from "./my-booking-item.ts";
import { PaymentInstruction } from "./payment-instruction.ts";

/** 05#dto-MyBookingDetail — one booking for the customer (LIFF) */
export const MyBookingDetail = z.object({
  booking: MyBookingItem,
  groom: z.array(z.object({ startsAt: IsoInstant, petName: z.string(), groomerName: z.string(), services: z.array(z.string()) })),
  stays: z.array(z.object({ checkInDate: LocalDate, checkOutDate: LocalDate, roomTypeName: z.string() })),
  daycare: z.array(z.object({ visitDate: LocalDate, sessionName: z.string() })),
  /** null when no deposit is due or the branch has no PromptPay account */
  payment: PaymentInstruction.nullable(),
  policySnapshot: z.record(z.string(), z.unknown()),
  /** R-07 customer_cancel if cancelled now; null when R-21 does not allow cancelling */
  cancelPreview: BookingsCancelPreviewResponse.nullable(),
  /** R-21 */
  rescheduleBlockedReason: z.enum(["STATUS_NOT_ALLOWED", "TOO_LATE_TO_RESCHEDULE", "RESCHEDULE_LIMIT"]).nullable(),
  shopPhone: z.string().nullable(),
  mapUrl: z.string().nullable(),
  icsUrl: z.string(),
});
export type MyBookingDetail = z.infer<typeof MyBookingDetail>;
