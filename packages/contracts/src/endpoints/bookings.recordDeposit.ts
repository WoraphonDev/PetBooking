import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";

export const BookingsRecordDepositParams = z.object({ bookingId: Uuid });
export const BookingsRecordDepositRequest = z.object({
  method: z.enum(["cash", "promptpay", "bank_transfer", "card_edc"]),
  amountSatang: Money.positive(),
  reference: z.string().trim().max(100).optional(),
  proofFileId: Uuid.optional(),
});
export type BookingsRecordDepositRequest = z.infer<typeof BookingsRecordDepositRequest>;
export const BookingsRecordDepositResponse = BookingDetail;
export type BookingsRecordDepositResponse = z.infer<typeof BookingsRecordDepositResponse>;
