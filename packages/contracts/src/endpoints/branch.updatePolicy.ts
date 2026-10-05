import { z } from "zod";
import { LocalTime } from "../common.ts";
import { BranchPolicy } from "../dto/branch-policy.ts";

const count = z.number().int().min(0);
/** every BranchPolicy field, all optional; 02 CHECKs: percent 0–100, slot step 5/10/15/30, deposit value ≥ 0 (≤ 100 as percent) */
export const BranchUpdatePolicyRequest = BranchPolicy.extend({
  defaultDepositValue: count,
  groomingFreeCancelHours: count,
  hotelFreeCancelHours: count,
  daycareFreeCancelHours: count,
  lateCancelForfeitPercent: count.max(100),
  bookingLeadMinutes: count,
  bookingHorizonDays: count,
  rescheduleCutoffHours: count,
  noShowGraceMinutes: count,
  slotStepMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  bufferMinutes: count,
  maxAppointmentsPerDay: z.number().int().min(1).nullable(),
  maxAppointmentsPerGroomerDay: z.number().int().min(1).nullable(),
  holdMinutes: z.number().int().min(1),
  approvalTimeoutMinutes: z.number().int().min(1),
  maxPetWeightGrams: z.number().int().min(1).nullable(),
  nextGroomDefaultDays: z.number().int().min(1),
  // the three template texts are NOT NULL in 02 (empty = none)
  groomingConsentText: z.string().max(20_000),
  boardingAgreementText: z.string().max(20_000),
  policyText: z.string().max(20_000),
  googleReviewUrl: z.url({ protocol: /^https$/ }).nullable(),
  dailySummaryTime: LocalTime,
})
  .partial()
  .strict();
export type BranchUpdatePolicyRequest = z.infer<typeof BranchUpdatePolicyRequest>;
export const BranchUpdatePolicyResponse = BranchPolicy;
export type BranchUpdatePolicyResponse = z.infer<typeof BranchUpdatePolicyResponse>;
