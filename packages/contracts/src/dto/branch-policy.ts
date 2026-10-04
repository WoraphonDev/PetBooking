import { z } from "zod";
import { LocalTime } from "../common.ts";
import { cancelRefundMode, depositType } from "../enums.ts";

const int = z.number().int();
export const BranchPolicy = z.object({
  defaultDepositType: depositType,
  defaultDepositValue: int,
  groomingFreeCancelHours: int,
  hotelFreeCancelHours: int,
  daycareFreeCancelHours: int,
  lateCancelForfeitPercent: int,
  cancelRefundMode,
  bookingLeadMinutes: int,
  bookingHorizonDays: int,
  rescheduleCutoffHours: int,
  noShowGraceMinutes: int,
  slotStepMinutes: int,
  bufferMinutes: int,
  maxAppointmentsPerDay: int.nullable(),
  maxAppointmentsPerGroomerDay: int.nullable(),
  holdMinutes: int,
  approvalTimeoutMinutes: int,
  autoConfirmGrooming: z.boolean(),
  autoConfirmHotel: z.boolean(),
  autoConfirmDaycare: z.boolean(),
  requiredVaccinesDog: z.array(z.string()),
  requiredVaccinesCat: z.array(z.string()),
  enforceVaccinesGrooming: z.boolean(),
  rejectedBreeds: z.array(z.string()),
  maxPetWeightGrams: int.nullable(),
  groomingConsentText: z.string().nullable(),
  boardingAgreementText: z.string().nullable(),
  policyText: z.string().nullable(),
  reminder24hEnabled: z.boolean(),
  economyMode: z.boolean(),
  nextGroomDefaultDays: int,
  googleReviewUrl: z.string().nullable(),
  reportCardRequiresReview: z.boolean(),
  dailySummaryTime: LocalTime,
});
export type BranchPolicy = z.infer<typeof BranchPolicy>;
