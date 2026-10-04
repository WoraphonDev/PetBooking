import { z } from "zod";
import { LocalDate, LocalTime, Money, Uuid } from "../common.ts";
import { stayStatus } from "../enums.ts";
import { PetSummary } from "./pet-summary.ts";

/** 05#dto-StayCard — one hotel stay. */
export const StayCard = z.object({
  id: Uuid,
  bookingId: Uuid,
  bookingNo: z.string(),
  status: stayStatus,
  pet: PetSummary,
  customerName: z.string(),
  roomTypeName: z.string(),
  roomUnitId: Uuid.nullable(),
  roomCode: z.string().nullable(),
  checkInDate: LocalDate,
  checkOutDate: LocalDate,
  expectedCheckInTime: LocalTime.nullable(),
  expectedCheckOutTime: LocalTime.nullable(),
  nights: z.number().int(),
  roomTotalSatang: Money,
  inHeat: z.boolean(),
  bundleAppointmentId: Uuid.nullable(),
  intakeCompleted: z.boolean(),
  agreementSigned: z.boolean(),
  /** R-11 result for the stay (mustBeValidOn = check_out_date) */
  vaccineGate: z.object({
    ok: z.boolean(),
    missing: z.array(z.string()),
    expired: z.array(z.string()),
    pendingReview: z.array(z.string()),
  }),
});
export type StayCard = z.infer<typeof StayCard>;
