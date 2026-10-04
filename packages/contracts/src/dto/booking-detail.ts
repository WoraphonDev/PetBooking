import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { actorType, bookingChannel, bookingStatus, depositStatus } from "../enums.ts";
import { AppointmentCard } from "./appointment-card.ts";
import { BookingEventItem } from "./booking-event-item.ts";
import { CustomerListItem } from "./customer-list-item.ts";
import { DaycareVisitItem } from "./daycare-visit-item.ts";
import { PaymentInstruction } from "./payment-instruction.ts";
import { SlipItem } from "./slip-item.ts";
import { StayCard } from "./stay-card.ts";

/** 05#dto-BookingDetail — a booking with its children, slips, payment instruction and history. */
export const BookingDetail = z.object({
  id: Uuid,
  bookingNo: z.string(),
  status: bookingStatus,
  channel: bookingChannel,
  customer: CustomerListItem,
  createdByType: actorType,
  createdAt: IsoInstant,
  holdExpiresAt: IsoInstant.nullable(),
  approvalDueAt: IsoInstant.nullable(),
  estimatedTotalSatang: Money,
  depositRequiredSatang: Money,
  depositStatus,
  depositVerifiedSatang: Money,
  /** copy of branch_policy at booking time */
  policySnapshot: z.record(z.string(), z.unknown()),
  customerNote: z.string().nullable(),
  rescheduleCount: z.number().int(),
  confirmedAt: IsoInstant.nullable(),
  cancelledAt: IsoInstant.nullable(),
  cancelledByType: actorType.nullable(),
  cancelReason: z.string().nullable(),
  firstServiceAt: IsoInstant.nullable(),
  billId: Uuid.nullable(),
  groom: z.array(AppointmentCard),
  stays: z.array(StayCard),
  daycare: z.array(DaycareVisitItem),
  slips: z.array(SlipItem),
  /** null when nothing is due or the branch has no PromptPay account */
  payment: PaymentInstruction.nullable(),
  events: z.array(BookingEventItem),
});
export type BookingDetail = z.infer<typeof BookingDetail>;
